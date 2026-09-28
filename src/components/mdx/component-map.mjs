import BodyHeading1 from "./typography/BodyHeading1.astro";
import Title2 from "./typography/Title2.astro";
import Title3 from "./typography/Title3.astro";
import Title4 from "./typography/Title4.astro";
import TooltipLink from "./TooltipLink.astro";
import InternalTooltipLink from "./InternalTooltipLink.astro";
import Footnote from "./Footnote.astro";
import IntroParagraph from "./IntroParagraph.astro";
import ResourceBook from "./ResourceBook.astro";
import RemoteImage from "./RemoteImage.astro";
import BasicImage from "./BasicImage.astro";
import Spacer from "./Spacer.astro";

export const mdxComponents = {
	h1: BodyHeading1,
	h2: Title2,
	h3: Title3,
	h4: Title4,
	a: TooltipLink,
	img: BasicImage,
	InternalTooltipLink,
	IntroParagraph,
	Footnote,
	BasicImage,
	ResourceBook,
	RemoteImage,
	Spacer,
};
