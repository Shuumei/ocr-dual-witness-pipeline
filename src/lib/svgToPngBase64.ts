export async function svgToPngBase64(svg: SVGSVGElement): Promise<string> {
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
  const canvas = document.createElement("canvas");
  canvas.width = viewBox.width || image.width;
  canvas.height = viewBox.height || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(",")[1];
}

export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/data:(.*);base64/)?.[1] ?? file.type;
  return { base64, mimeType };
}
