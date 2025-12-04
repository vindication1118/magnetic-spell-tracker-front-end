export class ArrayBufferHelper {
  public static toArrayBuffer(
    buf: ArrayBuffer | SharedArrayBuffer,
    byteOffset = 0,
    byteLength = (buf as ArrayBuffer).byteLength - byteOffset,
  ): ArrayBuffer {
    const src = new Uint8Array(buf as ArrayBufferLike, byteOffset, byteLength);
    const dst = new Uint8Array(src.byteLength); // ArrayBuffer-backed
    dst.set(src);
    return dst.buffer;
  }

  // Usage with a view:
  public static exactArrayBufferFromView(view: ArrayBufferView): ArrayBuffer {
    const src = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return src.slice().buffer; // or copy like above
  }

  // Normalize to a Uint8Array that is guaranteed to be backed by a plain ArrayBuffer
  public static toUint8Array(out: unknown): Uint8Array {
    if (out instanceof ArrayBuffer) return new Uint8Array(out);
    if (ArrayBuffer.isView(out)) {
      const u8 = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
      return new Uint8Array(u8); // copy to ensure ArrayBuffer backing (not SAB)
    }
    if (typeof out === 'string') return new TextEncoder().encode(out);
    throw new Error('Unexpected serialize() output type');
  }
}
