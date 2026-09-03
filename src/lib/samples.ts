export interface SampleMeter {
  id: string;
  label: string;
  /** Ground truth for the mock meter, only used to render the SVG face */
  digits: string;
  /** How degraded the rendered display is, purely cosmetic (blur/noise filter) */
  quality: "clean" | "glare" | "blurry";
}

export const SAMPLE_METERS: SampleMeter[] = [
  { id: "clean-42", label: "Clean reading", digits: "42.8", quality: "clean" },
  { id: "glare-71", label: "Glare across screen", digits: "178.2", quality: "glare" },
  { id: "blurry-90", label: "Out-of-focus photo", digits: "905.1", quality: "blurry" },
];
