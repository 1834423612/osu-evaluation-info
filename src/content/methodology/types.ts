export type MethodologyCopy = {
  className: string;
  title: string;
  eyebrow: string;
  intro: string;
  navigation: string;
  steps: { title: string; detail: string }[];
  sections: {
    id: string;
    title: string;
    paragraphs: string[];
    facts?: string[];
    link?: { label: string; href: string };
  }[];
};
