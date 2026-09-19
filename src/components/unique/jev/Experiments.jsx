import React from 'react';
import GardenLenses from './GardenLenses.jsx';
import Search from './Search.jsx';
import Relationships from './Relationships.jsx';
import EpistemicLinter from './EpistemicLinter.jsx';
import TendingReport from './TendingReport.jsx';
import Pipeline from './Pipeline.jsx';
import { Section } from './shared.jsx';
import './jev.css';

export default function Experiments({ snapshot }) {
  return <div className="jev">
    <header className="jev-section-heading">
      <h2>How the experiments work</h2>
      <p className="jev-section-description">Article text → typed questions → probabilities → ordinary code. Select a stage to inspect the data.</p>
    </header>
    <Pipeline snapshot={snapshot} />
    <Section number="01" title="Garden lenses"
      description="Move the sliders to reorder articles by assumed knowledge, practicality, abstraction, and speculation. Select an article to inspect its scores.">
      <GardenLenses documents={snapshot.documents} />
    </Section>
    <Section number="02" title="Semantic garden search" mode="Live Jev search"
      description="Enter an idea to compare keyword results with Jev’s relevance rankings and selected source passages.">
      <Search documents={snapshot.documents} />
    </Section>
    <Section number="03" title="Typed relationship graph"
      description="Choose an article to explore connections such as examples, prerequisites, and contradictions. Select a connection to inspect its supporting passages.">
      <Relationships documents={snapshot.documents} relations={snapshot.relations} />
    </Section>
    <Section number="04" title="Epistemic disclosure linter"
      description="Choose an article to inspect claim types and possible citation or qualification gaps. Hover or focus a sentence to see Jev’s probabilities.">
      <EpistemicLinter documents={snapshot.documents} />
    </Section>
    <Section number="05" title="Garden-tending report" mode="Saved Jev evaluations + code checks"
      description="Review maintenance recommendations grouped by post. Expand a post to see suggested metadata, classification, connection, and freshness changes; nothing edits your garden.">
      <TendingReport documents={snapshot.documents} relations={snapshot.relations} generatedAt={snapshot.generatedAt} />
    </Section>
    <p className="jev-meta">{snapshot.generatedAt ? `Evaluated ${snapshot.generatedAt.slice(0, 10)} · ${snapshot.model} · ${snapshot.documents.length} articles` : 'Awaiting saved evaluations'}</p>
  </div>;
}
