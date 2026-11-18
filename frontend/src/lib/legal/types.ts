// Legal documents supplied by AstroRize (Terms & Conditions, Privacy Policy). The wording is the
// client's own — change it only on their instruction.

export type Block =
  | string
  /** A paragraph that opens with a bold phrase ("Age requirement.") */
  | { lead: string; text: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } };

export interface LegalSection {
  id: string;
  title: string;
  blocks: Block[];
}

export interface LegalDoc {
  title: string;
  /** The page's <meta description> */
  description: string;
  /** A boxed notice shown at the very top (emergency notice / summary) */
  notice?: { kind: "danger" | "summary"; text: string };
  intro: string[];
  sections: LegalSection[];
}
