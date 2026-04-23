# Example: Footnote Style

Footnotes are a signature part of the user's writing. They're used frequently and have personality – not just dry citations.

## Types of Footnotes

### 1. Humorous Asides

"Putting the word FUCK in all caps in your opening is a valid way to get people's attention, but you'll need to back it up with a good story.[footnote: Unlike the dozens of Mark Manson-ites who have cheaply used the sacred word to sell crappy self-help books like Unf✶ck Yourself, Grow the F✶ck Up, and The F✶ck It Diet.]"

"The Enlightenment guys[footnote: Yeah, it's mostly men. Women were banned from attending universities, participating in most public institutions, and publishing their work. There are a few exceptions like Mary Wollstonecraft, Olympe de Gouges, and Émilie du Châtelet. But they're not key enlightenment figures. Feminism really picks up in the mid-1800s.] wrote in ways that challenged their readers..."

### 2. Self-Deprecating Commentary

"Here are some good examples of it: [list of essayists][footnote: I'm not going to be winning any originality awards for this lot – hard to pick a more cliché array.]"

### 3. Clarifying Terms or Context

"This is where language evolves. We have designed a system that automates a standardised way of writing. We have codified _la langue_ at a specific point in time.[footnote: For those from outside the Commonwealth, 'faffing' means mucking about without a clear direction or useful output]"

"Since none of these folks reference to the earlier nineties notion of **digital gardening**, or mention issues of hypertext navigation, this use of the word feels like a brief tangent.[footnote: The caretaking roles given to people who cleaned up broken links, attributions, and awkward white space on shared wiki websites.]"

### 4. Academic Citations (Presented Casually)

"They're designed to pump out advertising copy, blog posts, emails, social media updates, and marketing pages. And they're _really_ good at it.[footnote: Primarily because GPT-3 which powers many of these products was specifically trained on text from the web. It's intimately familiar with the style of language we use online.]"

"Many of the later thinkers in the tools for thought movement cite this article as a key influence.[footnote: Andy Matuschak and Michael Nielsen, (2019)]"

### 5. Qualifications and Caveats

"After the forest expands, we will become deeply sceptical of one another's _realness_.[footnote: 'Relationship' in the holistic sense – friend, acquaintance, pen pal, intellectual interlocutor, frenemy, drinking buddy, and sure, maybe a lover.]"

"Hipsterism and recency bias will help us here.[footnote: This feels eerily like a hostage holding up yesterday's newspaper to prove they are actively in danger. Perhaps a premonition.]"

### 6. Tangential but Interesting Information

"Sadly, both Haraway and Latour are horrendous writers and trying to understand their original texts is a laborious and baffling process, which is probably why they're not more widely known.[footnote: This was an expansion on her earlier essay A Cyborg Manifesto (1985), and she later wrote The Companion Species Manifesto (2003) followed this same line of thinking. I should also mention Bruno Latour's We Have Never Been Modern (1991) – another foundational text for this theory.]"

### 7. Acknowledging Biases or Limitations

"Roam Research is one of the central software characters in this story.[footnote: For transparency I should state I started using Roam as my primary knowledge base in November of 2019 so my understanding of this history is certainly coloured by that affiliation.]"

"Disclaimer that Joel is a mentor, collaborator and friend, so my exposure to the idea comes from his early advocacy and enthusiasm for it."

---

## Key Principles

1. **Footnotes have voice** – They're not neutral. They contain opinions, jokes, and personality.

2. **Use them to avoid interrupting flow** – When you have something to say but it would derail the main argument, put it in a footnote.

3. **Don't be precious about them** – Use them liberally. Multiple footnotes per section is fine.

4. **Mix academic and casual** – A footnote can cite a paper AND make a joke about it.

5. **Acknowledge limitations and biases** – Footnotes are a good place to be transparent about your perspective or conflicts of interest.

---

## Implementation Note

In the user's MDX files, footnotes are implemented with a custom component:

```jsx
<Footnote idName={1}>Content of the footnote here.</Footnote>
```

Some footnotes use `isClosed` prop to indicate they're collapsed by default:

```jsx
<Footnote isClosed idName={2}>Less essential content here.</Footnote>
```
