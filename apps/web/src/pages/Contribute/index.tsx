import { type TabType } from './types'
import MyContributions from './components/tabs/MyContributions'
import AllOffers from './components/tabs/AllOffers'

interface ContributeProps {
  initialTab?: TabType
}

export default function Contribute({ initialTab = 'offers' }: ContributeProps) {
  return (
    <div className="w-full">
      {initialTab === 'mine' && (
        <MyContributions />
      )}

      {initialTab === 'offers' && (
        <AllOffers />
      )}
    </div>
  )
}
