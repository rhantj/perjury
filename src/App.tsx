import GameScreen from './components/GameScreen'
import MuteButton from './components/MuteButton'

export default function App() {
  return (
    <>
      <GameScreen />
      {/* 표지·브리핑·게임판을 가리지 않고 늘 같은 자리에 있어야 해서 화면 바깥에 둔다. */}
      <MuteButton />
    </>
  )
}
