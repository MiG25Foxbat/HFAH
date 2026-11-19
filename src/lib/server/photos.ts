import "server-only";
import sharp from "sharp";
import { ApiError } from "./http";

/** Лимит размера загружаемого файла (байты) и пикселей на входе. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 40e6;
/** Длинная сторона после сжатия. */
export const MAX_SIDE = 1600;

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Настоящий формат определяется по содержимому (sharp), а не по имени и MIME от клиента. Допустимы JPEG, PNG, WebP.
 * Результат: WebP quality 80, повёрнут по EXIF, вписан в 1600 px, метаданные удалены (GPS и прочее).
 */
export async function normalizeImage(input: Buffer): Promise<ProcessedImage> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const meta = await image.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw new ApiError(415, "Подходят только фото JPEG, PNG и WebP.", { code: "bad_image_format" });
    }
    const { data, info } = await image
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, bytes: info.size };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof Error && /pixel limit/i.test(e.message)) {
      throw new ApiError(413, "Слишком большое разрешение: до 40 мегапикселей.", { code: "image_too_large" });
    }
    throw new ApiError(415, "Не удалось прочитать фото. Подходят JPEG, PNG и WebP.", { code: "bad_image" });
  }
}
