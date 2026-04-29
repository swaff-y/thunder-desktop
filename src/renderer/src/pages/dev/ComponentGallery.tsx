// Temporary gallery for TD-010 smoke-testing. Delete when no longer needed.
import type { ContentRecord } from '../../types'
import CartDropdown from '../../components/shared/CartDropdown'
import CategoryAutocomplete from '../../components/shared/CategoryAutocomplete'
import ContentTable from '../../components/shared/ContentTable'
import ErrorState from '../../components/shared/ErrorState'
import FilterBar from '../../components/shared/FilterBar'
import ImageCarousel from '../../components/shared/ImageCarousel'
import LoadingSpinner from '../../components/shared/LoadingSpinner'
import LoadMore from '../../components/shared/LoadMore'
import VideoPlayer from '../../components/shared/VideoPlayer'
import VirtualRecordList from '../../components/shared/VirtualRecordList'
import ContentGrid from '../../components/desktop/ContentGrid'
import DesktopCard from '../../components/desktop/DesktopCard'
import HeroCarousel from '../../components/desktop/HeroCarousel'
import CtrSection from '../../components/desktop/stats/CtrSection'
import PlatformActivityChart from '../../components/desktop/stats/PlatformActivityChart'
import SummaryChart from '../../components/desktop/stats/SummaryChart'
import TopEntitiesTable from '../../components/desktop/stats/TopEntitiesTable'
import TrendingTable from '../../components/desktop/stats/TrendingTable'

const sampleRecord: ContentRecord = {
  id: 'sample-1',
  name: 'Sample record',
  actors: [{ id: 'a1', name: 'Actor One' }],
  tags: [{ id: 't1', name: 'Sample tag' }],
  images: [{ url: 'https://placehold.co/600x400' }],
  likes: 12,
  views: 345
}

const sampleRecords: ContentRecord[] = Array.from({ length: 8 }, (_, i) => ({
  ...sampleRecord,
  id: `sample-${i + 1}`,
  name: `Sample record ${i + 1}`
}))

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
      <h3 style={{ marginBottom: '1rem' }}>{title}</h3>
      {children}
    </section>
  )
}

export default function ComponentGallery(): React.JSX.Element {
  return (
    <div>
      <h2>Component Gallery (TD-010)</h2>

      <Section title="LoadingSpinner">
        <LoadingSpinner />
      </Section>

      <Section title="ErrorState">
        <ErrorState message="Sample error" onRetry={() => {}} />
      </Section>

      <Section title="FilterBar">
        <FilterBar value="" onChange={() => {}} placeholder="Search..." />
      </Section>

      <Section title="LoadMore">
        <LoadMore hasNextPage={true} isFetchingNextPage={false} fetchNextPage={() => {}} />
      </Section>

      <Section title="CartDropdown">
        <CartDropdown />
      </Section>

      <Section title="CategoryAutocomplete">
        <CategoryAutocomplete apiPath="v1/actor" placeholder="Pick an actor" onSelect={() => {}} />
      </Section>

      <Section title="ImageCarousel">
        <ImageCarousel images={sampleRecord.images} />
      </Section>

      <Section title="VideoPlayer">
        <VideoPlayer src="https://placehold.co/sample.mp4" title="Sample" />
      </Section>

      <Section title="ContentTable">
        <ContentTable record={sampleRecord} />
      </Section>

      <Section title="DesktopCard">
        <div style={{ maxWidth: 320 }}>
          <DesktopCard record={sampleRecord} />
        </div>
      </Section>

      <Section title="HeroCarousel">
        <HeroCarousel records={sampleRecords.slice(0, 3)} />
      </Section>

      <Section title="ContentGrid">
        <ContentGrid records={sampleRecords} />
      </Section>

      <Section title="VirtualRecordList">
        <VirtualRecordList records={sampleRecords} />
      </Section>

      <Section title="stats/CtrSection">
        <CtrSection />
      </Section>

      <Section title="stats/PlatformActivityChart">
        <PlatformActivityChart />
      </Section>

      <Section title="stats/SummaryChart">
        <SummaryChart title="Top tags (clicks)" entityType="tag" eventType="click" />
      </Section>

      <Section title="stats/TopEntitiesTable">
        <TopEntitiesTable title="Top tags" entityType="tag" />
      </Section>

      <Section title="stats/TrendingTable">
        <TrendingTable title="Trending tags" entityType="tag" />
      </Section>
    </div>
  )
}
