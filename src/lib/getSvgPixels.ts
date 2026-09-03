// Sample resolution for the decoder: high enough that thin 1-2px segment
// bars survive rasterization, without needing anything as heavy as a full
// photo export.
const RASTER_SCALE = 12;

export async function getSvgPixels(svg: SVGSVGElement): Promise<ImageData> {
  const serialized = new XMLSerializer().serializeToString(svg);
  const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(serialized)))}`;

  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to rasterize SVG sample."));
  });
  image.src = svgUrl;
  await loaded;

  const viewBox = svg.viewBox.baseVal;
  const width = (viewBox.width || image.width) * RASTER_SCALE;
  const height = (viewBox.height || image.height) * RASTER_SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  // The SVG's own background is a Tailwind class, which does not apply when
  // the markup is loaded standalone via data: URI -- fill explicitly.
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return ctx.getImageData(0, 0, width, height);
}
