export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Non-JSON response (CSV, images).
export class Reply {
  constructor(body, type, headers = {}) {
    this.body = body;
    this.type = type;
    this.headers = headers;
  }
}

export const MAX_BODY = 16 * 1024 * 1024;

export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'ข้อมูลใหญ่เกินไป');
    chunks.push(chunk);
  }
  if (!size) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'รูปแบบข้อมูลไม่ถูกต้อง');
  }
}
