import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

console.log('=== POD产品设计器启动 ===')
console.log('当前时间:', new Date().toLocaleString())

try {
  const rootElement = document.getElementById('root')
  console.log('root 元素:', rootElement)
  
  if (rootElement) {
    const root = createRoot(rootElement)
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    console.log('App 渲染完成')
  } else {
    console.error('ERROR: root 元素不存在!')
  }
} catch (error) {
  console.error('渲染错误:', error)
}
