export type ReferenceRole = 'model' | 'front' | 'back'
export function normalizeReferenceTemplate(text: string): string
export function buildReferenceContext(roles?: ReferenceRole[]): string
