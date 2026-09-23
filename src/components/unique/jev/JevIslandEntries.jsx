import React from 'react';
import snapshot from '../../../data/jev/garden.json';
import playgroundSnapshot from '../../../data/jev/playground.json';
import EpistemicLinter from './EpistemicLinter.jsx';
import GardenLenses from './GardenLenses.jsx';
import Pipeline from './Pipeline.jsx';
import Relationships from './Relationships.jsx';
import Search from './Search.jsx';
import TendingReport from './TendingReport.jsx';

export function JevPlaygroundIsland() {
  return <Pipeline snapshot={playgroundSnapshot} />;
}

export function SpectrumNavigationIsland() {
  return <GardenLenses documents={snapshot.documents} />;
}

export function SemanticSearchIsland() {
  return <Search documents={snapshot.documents} />;
}

export function TypedRelationshipGraphIsland() {
  return <Relationships documents={snapshot.documents} relations={snapshot.relations} />;
}

export function EpistemicLinterIsland() {
  return <EpistemicLinter documents={snapshot.documents} />;
}

export function GardenTendingWorkshopIsland() {
  return <TendingReport documents={snapshot.documents} relations={snapshot.relations} generatedAt={snapshot.generatedAt} />;
}
