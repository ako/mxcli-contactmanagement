// Minimal OTLP/HTTP trace collector. The Java agent exports protobuf over
// http/protobuf, so this hand-decodes the wire format (no deps) and appends one
// JSON object per span to spans.jsonl.
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');

const OUT = process.env.SPANS_OUT || 'spans.jsonl';

// ── protobuf wire reader ────────────────────────────────────────────────────
class Reader {
  constructor(buf) { this.b = buf; this.p = 0; }
  get eof() { return this.p >= this.b.length; }
  varint() {
    let result = 0n, shift = 0n;
    for (;;) {
      const byte = this.b[this.p++];
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7n;
    }
    return result;
  }
  key() { const k = this.varint(); return { field: Number(k >> 3n), wire: Number(k & 7n) }; }
  bytes() { const len = Number(this.varint()); const s = this.p; this.p += len; return this.b.subarray(s, this.p); }
  fixed64() { const v = this.b.readBigUInt64LE(this.p); this.p += 8; return v; }
  fixed32() { const v = this.b.readUInt32LE(this.p); this.p += 4; return v; }
  skip(wire) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.p += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.p += 4;
    else throw new Error('bad wire type ' + wire);
  }
}

// Walk a message, calling handler(field, reader, wire) for each field.
function each(buf, handler) {
  const r = new Reader(buf);
  while (!r.eof) {
    const { field, wire } = r.key();
    if (!handler(field, r, wire)) r.skip(wire);
  }
}

function anyValue(buf) {
  let out = null;
  each(buf, (f, r, w) => {
    if (f === 1 && w === 2) { out = r.bytes().toString('utf8'); return true; }
    if (f === 2 && w === 0) { out = r.varint() !== 0n; return true; }
    if (f === 3 && w === 0) { const v = r.varint(); out = Number(BigInt.asIntN(64, v)); return true; }
    if (f === 4 && w === 1) { out = Buffer.from(r.b.subarray(r.p, r.p + 8)).readDoubleLE(0); r.p += 8; return true; }
    return false;
  });
  return out;
}

function keyValue(buf) {
  let k = null, v = null;
  each(buf, (f, r, w) => {
    if (f === 1 && w === 2) { k = r.bytes().toString('utf8'); return true; }
    if (f === 2 && w === 2) { v = anyValue(r.bytes()); return true; }
    return false;
  });
  return [k, v];
}

function parseSpan(buf) {
  const s = { attrs: {} };
  each(buf, (f, r, w) => {
    switch (f) {
      case 1: s.traceId = r.bytes().toString('hex'); return true;
      case 2: s.spanId = r.bytes().toString('hex'); return true;
      case 4: s.parentSpanId = r.bytes().toString('hex'); return true;
      case 5: s.name = r.bytes().toString('utf8'); return true;
      case 6: s.kind = Number(r.varint()); return true;
      case 7: s.start = r.fixed64().toString(); return true;
      case 8: s.end = r.fixed64().toString(); return true;
      case 9: { const [k, v] = keyValue(r.bytes()); if (k !== null) s.attrs[k] = v; return true; }
      default: return false;
    }
  });
  return s;
}

function parseScopeSpans(buf, scopeName, sink) {
  each(buf, (f, r, w) => {
    if (f === 1 && w === 2) {           // InstrumentationScope
      each(r.bytes(), (ff, rr, ww) => {
        if (ff === 1 && ww === 2) { scopeName.v = rr.bytes().toString('utf8'); return true; }
        return false;
      });
      return true;
    }
    if (f === 2 && w === 2) { const s = parseSpan(r.bytes()); s.scope = scopeName.v; sink.push(s); return true; }
    return false;
  });
}

function parseResourceSpans(buf, sink) {
  const scopeName = { v: '' };
  each(buf, (f, r, w) => {
    if (f === 2 && w === 2) { parseScopeSpans(r.bytes(), scopeName, sink); return true; }
    return false;
  });
}

function parseExport(buf) {
  const spans = [];
  each(buf, (f, r, w) => {
    if (f === 1 && w === 2) { parseResourceSpans(r.bytes(), spans); return true; }
    return false;
  });
  return spans;
}

// ── server ──────────────────────────────────────────────────────────────────
let total = 0;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    let body = Buffer.concat(chunks);
    try {
      const enc = (req.headers['content-encoding'] || '').toLowerCase();
      if (enc.includes('gzip')) body = zlib.gunzipSync(body);
      if (req.url.includes('/v1/traces')) {
        const spans = parseExport(body);
        if (spans.length) {
          fs.appendFileSync(OUT, spans.map(s => JSON.stringify(s)).join('\n') + '\n');
          total += spans.length;
          process.stdout.write(`\rspans received: ${total}   `);
        }
      }
    } catch (e) {
      console.error('\ndecode error:', e.message);
    }
    res.writeHead(200, { 'Content-Type': 'application/x-protobuf' });
    res.end(Buffer.alloc(0));   // empty ExportTraceServiceResponse
  });
});

server.listen(4318, '127.0.0.1', () => console.log('OTLP collector listening on 127.0.0.1:4318 ->', OUT));
