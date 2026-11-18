import type { LegalDoc } from "./types";

// Data Deletion Policy — assembled only from wording in the client's Privacy Policy and Terms &
// Conditions (Your Rights, Data Retention, Children's Privacy, Account Suspension and Termination,
// AstroRize Wallet and Service Credits, Grievance Redressal). Nothing here is new policy: if the
// client changes those documents, change this page to match.

export const DELETION_POLICY: LegalDoc = {
  title: "Data Deletion Policy",
  description:
    "How to request deletion of your AstroRize account and personal data, what happens to your Wallet, what may be retained and for how long, and how to raise a concern.",
  notice: {
    kind: "summary",
    text: "In summary: You have the right to request deletion of your account and associated personal data, where no legal or legitimate retention obligation applies. Use the in-app settings or write to support@astrorize.com.",
  },
  intro: [
    "This page brings together what the AstroRize Privacy Policy and Terms & Conditions say about deleting your account and personal data. It is published by AstroRize Private Limited acting as a Data Fiduciary under the Digital Personal Data Protection Act, 2023 (\"DPDP Act\").",
  ],
  sections: [
    {
      id: "your-right-to-erasure",
      title: "Your right to erasure",
      blocks: [
        "Erasure (account deletion): to request deletion of your account and associated personal data, where no legal or legitimate retention obligation applies.",
        "The User may discontinue use and request account deletion at any time through the Platform settings or by contacting customer support, subject to the Privacy Policy.",
      ],
    },
    {
      id: "how-to-request-deletion",
      title: "How to request deletion",
      blocks: [
        "To exercise any of these rights, use the in-app settings or contact us at support@astrorize.com. We may verify your identity before acting on a request. We will respond within the time required by applicable law.",
        "The step-by-step instructions are on the Delete Account page.",
      ],
    },
    {
      id: "withdrawing-consent",
      title: "Withdrawing consent",
      blocks: [
        "Withdrawal of consent: to withdraw consent at any time without affecting the lawfulness of processing already carried out, and to manage your communication preferences.",
        "Where we rely on consent as the lawful basis for processing, you may withdraw your consent at any time, and withdrawal is as easy to exercise as giving consent. Withdrawal of consent does not affect the lawfulness of processing carried out before the withdrawal.",
        "You may opt out of promotional messages at any time by replying STOP to any SMS, using the unsubscribe feature in emails, or adjusting your preferences in the in-app settings. Opting out does not affect service, transactional or legally required communications.",
      ],
    },
    {
      id: "wallet-and-service-credits",
      title: "Wallet and Service Credits on termination",
      blocks: [
        "On termination: all unused Bonus Credits lapse immediately; unused Recharge Credits are dealt with in accordance with the Wallet clause and applicable law.",
        "The AstroRize Wallet is a closed-loop facility. Service Credits carry no cash value and are non-transferable, non-assignable and non-withdrawable; they cannot be exchanged for cash or cash equivalents except where a refund to source is required by law or expressly offered by AstroRize.",
        "Refunds, where approved, are credited to the User's AstroRize Wallet by default. Refunds to the original payment method are made only where required by applicable law or where AstroRize expressly elects to do so.",
        "For the full terms, see the AstroRize Wallet and Service Credits and Refund and Cancellation Policy sections of the Terms & Conditions.",
      ],
    },
    {
      id: "what-we-may-retain",
      title: "What we may retain, and for how long",
      blocks: [
        "AstroRize retains personal data only for as long as it is reasonably necessary to fulfil the purposes described in the Privacy Policy, or as required by applicable law — including tax, accounting, audit and dispute-related retention periods. Once data is no longer required for any lawful purpose, it is securely deleted or anonymised.",
        "We maintain a retention schedule that sets indicative retention periods by data category, and we retain each category only for the period appropriate to its purpose or as required by law.",
        "When you accept a policy, acknowledgement or consent prompt (for example, a Fixed Session acknowledgement), a record of your acceptance — including the time of acceptance and the version of the policy accepted — may be retained for evidentiary, dispute-resolution and compliance purposes. We retain the minimum information necessary for this purpose.",
        "Session recordings are retained for a defined, limited period based on the capabilities of the underlying communication provider — for telephone (PSTN) recordings, approximately three to six months, and for in-app (WebRTC) recordings, a longer period of up to three years where technically supported and approved — after which they are deleted, unless further retention is required for a pending legal or regulatory matter.",
        "Payment information is handled exclusively by PCI-DSS-compliant payment partners; full card/bank details are processed exclusively by our PCI-compliant payment partners and are not stored by AstroRize.",
      ],
    },
    {
      id: "childrens-data",
      title: "Children's data",
      blocks: [
        "If a parent or guardian becomes aware that a Minor has used the Platform without the required consent, they should contact us immediately at support@astrorize.com. Upon verification, we will take appropriate steps to delete the Minor's data from our systems.",
      ],
    },
    {
      id: "nominee-and-other-rights",
      title: "Nomination and other rights",
      blocks: [
        "Nomination: to nominate another individual to exercise your data rights in the event of your death or incapacity, in accordance with the DPDP Act.",
        "Access: to obtain a summary of the categories of personal data we hold about you and the purposes for which it is being processed. Correction and update: to have inaccurate or incomplete personal data corrected or completed.",
      ],
    },
    {
      id: "grievance-redressal",
      title: "Grievance redressal",
      blocks: [
        "Grievance redressal: to raise a concern with our Grievance Officer and to escalate unresolved matters to the Data Protection Board of India.",
        {
          table: {
            head: ["Grievance Officer / DPO", "Kunal Prasad, AstroRize Private Limited"],
            rows: [
              ["Email", "support@astrorize.com"],
              ["Address", "D-E-407, MPR Urban City, Patiganpur, Patencheru, Hyderabad,502319"],
              ["Acknowledgement", "Within 48 hours of receipt"],
              ["Resolution", "Within the period required by applicable law or within 30 days, whichever is shorter"],
              ["Escalation", "Unresolved data-protection complaints may be escalated to the Data Protection Board of India"],
            ],
          },
        },
      ],
    },
  ],
};
