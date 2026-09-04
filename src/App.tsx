import ShirtLibrary from '@/components/ShirtLibrary'
import DesignUploader from '@/components/DesignUploader'
import CanvasEditor from '@/components/CanvasEditor'
import Toolbar from '@/components/Toolbar'
import PreviewPanel from '@/components/PreviewPanel'
import ResizablePanel from '@/components/ResizablePanel'
import { Layers } from 'lucide-react'

console.log('=== App 组件加载 ===')

function App() {
  console.log('App 渲染函数执行')
  
  return (
    <div className="h-screen flex flex-col bg-gray-200">
      <header className="bg-white shadow-sm px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">POD产品设计器</h1>
            <p className="text-sm text-gray-500">上传设计贴图，快速生成产品效果图</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-4 gap-0">
        <ResizablePanel defaultWidth={256} minWidth={150} maxWidth={400}>
          <ShirtLibrary />
        </ResizablePanel>

        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <CanvasEditor />
          <Toolbar />
        </div>

        <ResizablePanel defaultWidth={224} minWidth={150} maxWidth={800} handleSide="left">
          <DesignUploader />
        </ResizablePanel>
        
        <ResizablePanel defaultWidth={240} minWidth={150} maxWidth={350} handleSide="left">
          <PreviewPanel />
        </ResizablePanel>
      </main>

      <footer className="bg-white border-t border-gray-200 px-6 py-2">
        <p className="text-sm text-gray-400 text-center">POD产品设计器 · Created by lufan</p>
      </footer>
    </div>
  )
}

export default App
