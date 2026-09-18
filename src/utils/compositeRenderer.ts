import { Design, Shirt } from '@/types'

export interface CompositeTransform {
  position: { x: number; y: number }
  scale: number
  rotation: number
  hasDesign: boolean
}

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('图片加载失败'))
  image.src = src
})

export const renderCompositeCanvas = async (
  shirt: Shirt,
  design: Design | null,
  transform: CompositeTransform,
  side: 'front' | 'back'
) => {
  const shirtImage = await loadImage(side === 'front' ? shirt.frontImage : shirt.backImage)
  const canvas = document.createElement('canvas')
  canvas.width = shirtImage.width
  canvas.height = shirtImage.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建合成画布')

  context.drawImage(shirtImage, 0, 0, canvas.width, canvas.height)
  if (design && transform.hasDesign) {
    const designImage = await loadImage(design.imageData)
    const centerX = canvas.width / 2 + transform.position.x
    const centerY = canvas.height / 2 + transform.position.y
    context.save()
    context.translate(centerX, centerY)
    context.rotate((transform.rotation * Math.PI) / 180)
    context.scale(transform.scale, transform.scale)
    context.drawImage(designImage, -design.width / 2, -design.height / 2, design.width, design.height)
    context.restore()
  }
  return canvas
}

export const renderCompositeBlob = async (
  shirt: Shirt,
  design: Design | null,
  transform: CompositeTransform,
  side: 'front' | 'back'
) => {
  const canvas = await renderCompositeCanvas(shirt, design, transform, side)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 编码失败')), 'image/png', 1)
  })
}

export const renderCompositeDataUrl = async (
  shirt: Shirt,
  design: Design | null,
  transform: CompositeTransform,
  side: 'front' | 'back'
) => (await renderCompositeCanvas(shirt, design, transform, side)).toDataURL('image/png', 1)
