function App(): React.JSX.Element {
  return (
    <main
      style={{
        fontFamily: '-apple-system, system-ui, sans-serif',
        padding: '2rem',
        textAlign: 'center'
      }}
    >
      <h1>Thunder Desktop</h1>
      <p>v{__APP_VERSION__}</p>
    </main>
  )
}

export default App
