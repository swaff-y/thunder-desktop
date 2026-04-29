import { HashRouter } from 'react-router-dom'
import DesktopLayout from './layouts/DesktopLayout'
import { QueryProvider } from './components/QueryProvider'

function App(): React.JSX.Element {
  return (
    <QueryProvider>
      <HashRouter>
        <DesktopLayout>
          <div>Hello Thunder</div>
        </DesktopLayout>
      </HashRouter>
    </QueryProvider>
  )
}

export default App
