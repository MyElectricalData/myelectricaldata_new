import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ConsumptionKwh from './pages/ConsumptionKwh'
import ConsumptionEuro from './pages/ConsumptionEuro'
import Production from './pages/Production'
import Bilan from './pages/Bilan'
import Tempo from './pages/Tempo'
import Ecowatt from './pages/Ecowatt'
import Simulation from './pages/Simulation'
import Exporters from './pages/Exporters'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="consumption_kwh" element={<ConsumptionKwh />} />
        <Route path="consumption_euro" element={<ConsumptionEuro />} />
        <Route path="production" element={<Production />} />
        <Route path="bilan" element={<Bilan />} />
        <Route path="tempo" element={<Tempo />} />
        <Route path="ecowatt" element={<Ecowatt />} />
        <Route path="simulation" element={<Simulation />} />
        <Route path="exporters" element={<Exporters />} />
      </Route>
    </Routes>
  )
}
