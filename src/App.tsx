import { PhysicsCanvas } from './PhysicsCanvas'

function App() {
  return (
    <>
      <PhysicsCanvas />
      <span style={{
        position: 'fixed',
        top: 24,
        left: 24,
        fontSize: 12,
        fontFamily: 'ui-monospace, "SF Mono", monospace',
        userSelect: 'none',
        zIndex: 1000,
      }}>
        Matias Jansen, Designer
      </span>
    </>
  )
}

export default App
