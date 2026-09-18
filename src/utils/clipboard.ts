const getElectron = () => {
  try {
    const desktopWindow = window as Window & { require?: (name: string) => any }
    return desktopWindow.require?.('electron')
  } catch {
    return null
  }
}

export const copyPngDataUrl = async (dataUrl: string) => {
  const electron = getElectron()
  if (electron?.clipboard && electron?.nativeImage) {
    const image = electron.nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) throw new Error('合成图片为空')
    electron.clipboard.writeImage(image)
    return
  }

  const blob = await fetch(dataUrl).then(response => response.blob())
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('当前环境不支持图片剪贴板')
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}

export const copyPlainText = async (text: string) => {
  const electron = getElectron()
  if (electron?.clipboard) {
    electron.clipboard.writeText(text)
    return
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('当前环境不支持文本剪贴板')
}