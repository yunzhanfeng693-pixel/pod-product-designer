export interface Position {
  x: number
  y: number
}

export interface Shirt {
  id: string
  name: string
  color: string
  colorName: string
  frontImage: string
  backImage: string
  category: string
}

export interface Design {
  id: string
  name: string
  imageData: string
  width: number
  height: number
}

export interface CompositeState {
  selectedShirt: Shirt | null
  selectedDesign: Design | null
  designPosition: Position
  designScale: number
  designRotation: number
  savePath: string
}
