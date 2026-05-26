/**
 * Converts a parameter template ID (snake_case) to a sketch props key (camelCase).
 *
 * All parameter IDs follow strict snake_case, so the conversion is mechanical:
 *   "rotation_speed" → "rotationSpeed"
 *   "color_bg"       → "colorBg"
 *   "brightness"     → "brightness"
 *
 * Used by RendererRoot, RendererPreview, and useParameterStore when building
 * the params object passed to sketch components.
 */
export function templateIdToPropsKey(templateId: string): string {
  return templateId.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
