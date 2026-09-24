import React, { useMemo, useState } from 'react';
import { Empty } from './shared.jsx';
import { buildTendingPlan, filterTendingPlan, taskCounts, taskLabels, tasks, taskSummaries } from './tending.js';

const INITIAL_POSTS = 8;
const INITIAL_LINKS = 2;
const capitalise = text => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');
const tendedDate = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const lastTended = updated => {
  const date = new Date(updated);
  return Number.isNaN(date.getTime()) ? null : `Last tended ${tendedDate.format(date)}`;
};

function LinkList({ links }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? links : links.slice(0, INITIAL_LINKS);
  const hidden = links.length - shown.length;
  return <>
    {shown.map((link, index) => <React.Fragment key={link.doc.id}>
      {index > 0 && ', '}
      <a className="jev-link" href={link.doc.url} title={link.kind ? `${capitalise(link.kind)} · ${Math.round(link.probability * 100)}%` : undefined}>{link.doc.title}</a>
    </React.Fragment>)}
    {hidden > 0 && <>{' '}<button type="button" className="jev-tending-more-links" onClick={() => setExpanded(true)}>+{hidden} more</button></>}
  </>;
}

function TaskLine({ task, plan }) {
  let content;
  if (task === 'stage') {
    content = <>
      {capitalise(plan.stage.from)} <span aria-hidden="true">→</span><span className="visually-hidden">to</span>{' '}
      <span className="jev-tending-emphasis">{capitalise(plan.stage.to)}</span>
    </>;
  } else if (task === 'topics') {
    content = plan.topics.map(topic => topic.topic).join(', ');
  } else if (task === 'connections') {
    const { linkTo, linkFrom } = plan.connections;
    content = linkTo.length || linkFrom.length ? <>
      {!!linkTo.length && <span className="jev-tending-sub">Link to <LinkList links={linkTo} /></span>}
      {!!linkFrom.length && <span className="jev-tending-sub">Link from <LinkList links={linkFrom} /></span>}
    </> : 'Find a post that should link here';
  } else {
    const { reviewTitle, missingDescription, reviewDescription } = plan.title;
    content = [reviewTitle && 'Review the title', missingDescription && 'Add a description', reviewDescription && 'Review the description']
      .filter(Boolean).join(' · ');
  }
  return <div className="jev-tending-line">
    <dt className="jev-label">{taskLabels[task]}</dt>
    <dd>{content}</dd>
  </div>;
}

function PostPlan({ entry, activeTask }) {
  const { doc, plan } = entry;
  const shownTasks = activeTask === 'all' ? tasks.filter(task => plan[task]) : [activeTask];
  const meta = [capitalise(doc.type), capitalise(doc.growthStage), lastTended(doc.updated), plan.connections?.orphan && 'No backlinks yet']
    .filter(Boolean);
  return <>
    <div className="jev-tending-head">
      <a className="jev-link jev-tending-title" href={doc.url}>{doc.title}</a>
      <span className="jev-label jev-tending-meta">
        {meta.map((item, index) => <React.Fragment key={item}>{index > 0 && ' · '}<span>{item}</span></React.Fragment>)}
      </span>
    </div>
    <dl className="jev-tending-lines">
      {shownTasks.map(task => <TaskLine key={task} task={task} plan={plan} />)}
    </dl>
  </>;
}

export default function TendingReport({ documents, relations }) {
  const [activeTask, setActiveTask] = useState('all');
  const [limit, setLimit] = useState(INITIAL_POSTS);
  const entries = useMemo(() => buildTendingPlan(documents, relations), [documents, relations]);
  const counts = useMemo(() => taskCounts(entries), [entries]);
  const visible = useMemo(() => filterTendingPlan(entries, activeTask), [entries, activeTask]);
  if (!documents.length) return <div className="jev-kit jev-tending"><Empty /></div>;

  const chooseTask = task => {
    setActiveTask(current => (current === task ? 'all' : task));
    setLimit(INITIAL_POSTS);
  };
  const summary = activeTask === 'all'
    ? `${visible.length} of ${documents.length} posts need some tending`
    : `${visible.length} ${visible.length === 1 ? 'post' : 'posts'} ${taskSummaries[activeTask]}`;

  return <div className="jev-kit jev-tending">
    <div className="jev-tending-tiles" role="group" aria-label="Show posts needing">
      {tasks.map(task => <button key={task} type="button" className="jev-tending-tile"
        aria-pressed={activeTask === task} onClick={() => chooseTask(task)}>
        <span className="jev-tending-tile-count">{counts[task]}</span>
        <span className="jev-tending-tile-label">{taskLabels[task]}</span>
      </button>)}
    </div>
    <p className="jev-label jev-tending-summary" aria-live="polite">{summary}</p>
    {visible.length
      ? <ul className="jev-list jev-tending-posts">
          {visible.slice(0, limit).map(entry => <li className="jev-tending-post" key={entry.doc.id}>
            <PostPlan entry={entry} activeTask={activeTask} />
          </li>)}
        </ul>
      : <Empty>Nothing needs tending here.</Empty>}
    {visible.length > limit && <button type="button" className="jev-button jev-tending-more"
      onClick={() => setLimit(value => value + INITIAL_POSTS)}>Show more posts</button>}
  </div>;
}
