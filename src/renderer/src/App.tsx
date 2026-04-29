import { HashRouter } from 'react-router-dom'
import DesktopLayout from './layouts/DesktopLayout'

function App(): React.JSX.Element {
  return (
    <HashRouter>
      <DesktopLayout>
        <div>Hello Thunder</div>
      </DesktopLayout>
    </HashRouter>
  )
}

export default App
