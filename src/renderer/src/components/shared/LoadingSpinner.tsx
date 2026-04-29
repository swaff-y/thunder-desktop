// Stub — full implementation lands in TD-010 (port shared components).
import { Spinner } from 'react-bootstrap'

interface LoadingSpinnerProps {
  fullScreen?: boolean
  message?: string
}

export default function LoadingSpinner({ fullScreen }: LoadingSpinnerProps): React.JSX.Element {
  return (
    <div className={fullScreen ? 'd-flex justify-content-center align-items-center vh-100' : 'text-center py-3'}>
      <Spinner animation="border" />
    </div>
  )
}
