import type { LegalDoc } from "./types";

export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  description:
    "AstroRize Privacy Policy: what personal data we collect, why, how it is protected and shared, how long we keep it, and your rights under the DPDP Act, 2023.",
  notice: {
    kind: "summary",
    text: "In summary: We collect only what is necessary to provide our services and improve your experience. We do not sell, rent or trade your personal data. Your mobile number is never shared directly with a Service Provider — all calls are routed through our secure masking infrastructure. You have full rights to access, correct, delete and withdraw consent for your data. This Policy is aligned with the Digital Personal Data Protection Act, 2023.",
  },
  intro: [
    'This Privacy Policy ("Policy") is published by AstroRize Private Limited ("AstroRize", "we", "us", "our") acting as a Data Fiduciary under the Digital Personal Data Protection Act, 2023 ("DPDP Act"). It is also published in accordance with Section 43A of the Information Technology Act, 2000, Rule 4 of the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, and all other applicable data-protection laws.',
  ],
  sections: [
    {
      id: "user-consent",
      title: "User Consent",
      blocks: [
        "This Policy may be updated or amended from time to time in accordance with applicable law. By accessing the Platform and using it, you expressly consent to the collection, use, storage, processing and disclosure of your personal information in accordance with this Policy. Your continued use of the Platform after any update to this Policy constitutes your acceptance of the revised Policy, subject to your rights under the DPDP Act. You are advised to review this Policy periodically.",
        'Where we rely on consent as the lawful basis for processing, we obtain that consent through a clear, specific, informed and unambiguous affirmative action before processing commences. You may withdraw your consent at any time (see "Your Rights" below), and withdrawal is as easy to exercise as giving consent. Withdrawal of consent does not affect the lawfulness of processing carried out before the withdrawal.',
      ],
    },
    {
      id: "our-commitment-to-privacy",
      title: "Our Commitment to Privacy",
      blocks: [
        "AstroRize is committed to protecting the privacy of all users of the Platform, whether registered or not. We process personal data only for the purposes described in this Policy. We do not sell, rent or otherwise share your personal data with third parties for their marketing purposes.",
        "AstroRize ensures that its advertising and promotional activities comply with the Advertising Standards Council of India (ASCI) guidelines and the Consumer Protection Act, 2019. All communications include clear disclaimers that predictions and guidance provided through the Platform are without guaranteed outcomes.",
        "The Platform does not provide clinical diagnosis, medical treatment recommendations or crisis support. Users who are experiencing a mental health crisis or considering self-harm should immediately contact emergency services. AstroRize may, where required by law, share information with law enforcement authorities in connection with such situations.",
      ],
    },
    {
      id: "collection-of-personal-information",
      title: "Collection of Personal Information",
      blocks: [
        "Personal identifiable information is collected in the following circumstances:",
        {
          table: {
            head: ["Category", "Examples of data collected", "When collected"],
            rows: [
              ["Identity and contact", "Mobile number (mandatory, for OTP verification and account security), first name; optionally: last name, email address, gender, profile photo, preferred language", "During registration / account creation"],
              ["Consultation inputs", "Date, time and place of birth; other details entered for Kundli, horoscope, matchmaking or a Consultation; questions and concerns shared during sessions", "When using a service feature"],
              ["Visual inputs", "Photographs or images you voluntarily upload for palmistry, face reading, aura or energy-reading features, used solely for the stated purpose; not used for biometric identification or matching", "When using a relevant feature"],
              ["Payment data", "Transaction records, Wallet balance and history; full card/bank details are processed exclusively by our PCI-compliant payment partners and are not stored by AstroRize", "During payment / recharge"],
              ["Device and technical", "Device identifiers (including device ID), IP address, mobile network information, app and OS version, crash and diagnostic logs", "Automatically"],
              ["Usage and cookies", "Pages and features accessed, session duration, navigation patterns, preferences, and data from cookies and similar tracking technologies", "Automatically during use"],
              ["User-generated content", "Reviews, ratings, feedback, support queries, messages to our team", "When submitted by the user"],
              ["Location", "Approximate location inferred from IP address; precise location only if you grant explicit device-level permission", "Automatically / on permission"],
              ["Audio and video session data", 'Recordings of Consultations where recording is enabled and the User is notified (see Recording section below)', "During recorded Consultations"],
            ],
          },
        },
        "Non-personal identifiable information (which does not identify a specific individual) is also collected automatically and may include: referral URLs, internet service provider, browser type, geographical region and other aggregate analytics data. This information is used for improving the Platform, diagnosing technical issues, analysing trends and complying with applicable law.",
        "The user represents and confirms that all information provided to the Platform is authentic, accurate and current. AstroRize is not responsible for consequences arising from the submission of incorrect, incomplete or fraudulent information, and the User shall personally indemnify AstroRize for any breach in this respect.",
        'Your mobile number will never be shared directly with a Service Provider. All calls are connected through AstroRize\'s secure number-masking infrastructure (see "Number Masking" section below). Some categories of data — such as birth details — may be sensitive to you; we treat all such data with care and use it only for the purposes set out in this Policy.',
      ],
    },
    {
      id: "purpose-and-use-of-information",
      title: "Purpose and Use of Information",
      blocks: [
        {
          table: {
            head: ["Purpose", "Lawful basis (DPDP Act 2023)"],
            rows: [
              ["Creating and securing your account; OTP and identity verification", "Consent / necessary to provide the service"],
              ["Providing free tools and paid Consultations; generating reports; operating Platform features", "Consent / performance of service"],
              ["Processing payments, managing the Wallet, handling refunds and preventing fraud", "Necessary for service / legal obligation"],
              ["Connecting you with Service Providers through the number-masking infrastructure", "Consent / necessary for service"],
              ["Safety, quality assurance and dispute resolution (including review of session recordings where applicable)", "Legitimate use under DPDP / legal compliance"],
              ["Platform improvement, analytics and troubleshooting", "Consent (you may decline without losing access to the core Service)"],
              ["Sending service and transactional communications (OTPs, confirmations, notices)", "Necessary for service"],
              ["Sending promotional communications", "Consent (you may opt out at any time)"],
              ["Compliance with law, regulatory requirements and lawful authority requests", "Legal obligation / legitimate use under DPDP"],
            ],
          },
        },
        "We do not use personal data for fully automated decisions that produce legal or similarly significant effects without a lawful basis and appropriate human-oversight safeguards. Where personal data is used by AI-assisted features, this is disclosed and handled in accordance with the Terms & Conditions.",
      ],
    },
    {
      id: "number-masking-and-service-provider-connect",
      title: "Number Masking and Service-Provider Connect",
      blocks: [
        "When you opt to speak with a Service Provider by telephone through the Platform, AstroRize connects the call through a secure proxy/masking mechanism. Your real mobile number is not disclosed to the Service Provider at any time, and the Service Provider's direct number is not disclosed to you. This is a deliberate privacy-by-design measure to protect both parties.",
        "The Consultation-specific details you enter when booking a session are shared with the chosen Service Provider solely for the purpose of that particular Consultation. Any information you voluntarily disclose directly to a Service Provider during a session — beyond what AstroRize transmits — is shared at your own discretion and falls outside the protection of this Policy.",
      ],
    },
    {
      id: "voice-audio-and-video-session-data",
      title: "Voice, Audio and Video Session Data",
      blocks: [
        "Certain features of the Platform allow you to communicate with Service Providers via voice, audio or video, including Instant Call and Emergency Call Services where offered. To enable these features, AstroRize requests access to your device's microphone and, for video, camera. These permissions are used only for the purpose of facilitating the Consultation; they are not used to collect background information beyond the session.",
        "Applicable sessions and interactions on the Platform — including chat, audio calls, video calls, Instant Call and Emergency Call Services, and Live Sessions — are recorded by default for safety, quality assurance, dispute resolution and legal-compliance purposes. Where a session is being recorded, you are notified before the session begins. Recording is enabled by default and is controlled only by authorised administrative configuration where operationally and legally permitted. Recorded data is stored securely in compliance with applicable security standards, used only for the stated purposes, and deleted after the applicable retention period unless legal or regulatory retention is required.",
        "AstroRize is not responsible for the content, advice or outcomes of audio/video sessions. Users are advised to exercise discretion during such communications and not to share sensitive personal information beyond what is required for the Consultation.",
      ],
    },
    {
      id: "cookies-and-tracking-technologies",
      title: "Cookies and Tracking Technologies",
      blocks: [
        "AstroRize and its authorised service providers use cookies, device identifiers, pixel tags and similar tracking technologies to: (a) keep you signed in and remember your preferences; (b) secure the Platform and prevent fraud; (c) analyse usage and improve Platform features; and (d) deliver relevant content and personalised experiences. Analytics data is used in aggregate and, where possible, in a form that does not directly identify any individual user.",
        "You may control cookie preferences through your browser or device settings. Disabling certain cookies may affect the availability or functionality of some features. Where required by applicable law, a cookie-consent mechanism will be presented for non-essential cookies.",
      ],
    },
    {
      id: "security-measures",
      title: "Security Measures",
      blocks: [
        "AstroRize applies reasonable and industry-appropriate technical and organisational security measures to protect your personal data against unauthorised access, disclosure, alteration, destruction or loss. These include: data encryption in transit using SSL/TLS; access controls and authentication; system monitoring; and periodic security assessments. Payment information is handled exclusively by PCI-DSS-compliant payment partners on secure infrastructure.",
        "No transmission over the internet or electronic storage system can be guaranteed to be completely secure. AstroRize is not responsible for the security or confidentiality of communications sent by the User through the internet using external email or messaging services. Users are advised to protect their login credentials and to log out after each session.",
      ],
    },
    {
      id: "disclosure-and-sharing-of-information",
      title: "Disclosure and Sharing of Information",
      blocks: [
        "AstroRize does not sell, rent or otherwise trade your personal data with any third party. We may share data in the following circumstances only:",
        {
          list: [
            "Service Providers (practitioners): only the specific data required to deliver your chosen Consultation, subject to number masking as described above.",
            "Data Processors (technology and service partners): payment gateways, voice/video communication providers, cloud hosting, analytics and customer-support tools; all such processors are bound by contractual data-protection obligations to process data only on AstroRize's instructions and solely for the agreed purpose.",
            "Legal and regulatory requirements: where required by applicable law, court order, regulatory direction or a lawful request from a competent governmental authority, or to protect the rights, safety, property and integrity of AstroRize, its users, Service Providers and the general public.",
            "Business transfers: in the context of a merger, acquisition, restructuring, sale of assets or similar corporate event, subject to this Policy or notice to the User as required by law.",
            "Safety emergencies: where a User's communications indicate a risk to life (including their own), AstroRize may share relevant information with law enforcement or emergency services as required by law.",
          ],
        },
        "No mobile number or personal information submitted through the Platform is shared with any third party for marketing or promotional purposes without the User's prior consent.",
      ],
    },
    {
      id: "data-retention",
      title: "Data Retention",
      blocks: [
        "AstroRize retains personal data only for as long as it is reasonably necessary to fulfil the purposes described in this Policy, or as required by applicable law — including tax, accounting, audit and dispute-related retention periods. Once data is no longer required for any lawful purpose, it is securely deleted or anonymised.",
        "We maintain a retention schedule that sets indicative retention periods by data category, and we retain each category only for the period appropriate to its purpose or as required by law.",
        "When you accept a policy, acknowledgement or consent prompt (for example, a Fixed Session acknowledgement), a record of your acceptance — including the time of acceptance and the version of the policy accepted — may be retained for evidentiary, dispute-resolution and compliance purposes. We retain the minimum information necessary for this purpose.",
        "Session recordings are retained for a defined, limited period based on the capabilities of the underlying communication provider — for telephone (PSTN) recordings, approximately three to six months, and for in-app (WebRTC) recordings, a longer period of up to three years where technically supported and approved — after which they are deleted, unless further retention is required for a pending legal or regulatory matter.",
      ],
    },
    {
      id: "your-rights",
      title: "Your Rights (Data-Principal Rights)",
      blocks: [
        "Subject to applicable law, you have the following rights with respect to your personal data:",
        {
          list: [
            "Access: to obtain a summary of the categories of personal data we hold about you and the purposes for which it is being processed;",
            "Correction and update: to have inaccurate or incomplete personal data corrected or completed;",
            "Erasure (account deletion): to request deletion of your account and associated personal data, where no legal or legitimate retention obligation applies;",
            "Withdrawal of consent: to withdraw consent at any time without affecting the lawfulness of processing already carried out, and to manage your communication preferences;",
            "Nomination: to nominate another individual to exercise your data rights in the event of your death or incapacity, in accordance with the DPDP Act;",
            "Grievance redressal: to raise a concern with our Grievance Officer and to escalate unresolved matters to the Data Protection Board of India.",
          ],
        },
        "To exercise any of these rights, use the in-app settings or contact us at support@astrorize.com. We may verify your identity before acting on a request. We will respond within the time required by applicable law.",
      ],
    },
    {
      id: "childrens-privacy",
      title: "Children's Privacy",
      blocks: [
        'Account registration and payment for Services require users to be 18 years of age or over. A person under 18 ("Minor") may use the Platform only under the supervision of, and with the verifiable prior consent of, a parent or legal guardian, who is fully responsible for the Minor\'s use. Consistent with the DPDP Act, 2023, where we knowingly process a Minor\'s personal data we do so only on the basis of verifiable parental or guardian consent. We do not engage in behavioural tracking, targeted advertising or profiling directed at Minors.',
        "If a parent or guardian becomes aware that a Minor has used the Platform without the required consent, they should contact us immediately at support@astrorize.com. Upon verification, we will take appropriate steps to delete the Minor's data from our systems.",
      ],
    },
    {
      id: "international-data-transfers",
      title: "International Data Transfers",
      blocks: [
        "AstroRize primarily stores and processes personal data within India. Where personal data is processed outside India — for example, by third-party cloud, communication or analytics providers — we do so in compliance with applicable law, including any transfer restrictions or conditions notified under the DPDP Act, 2023, and we require that appropriate contractual or regulatory safeguards are in place. Users protected by other privacy laws (see Regional Rights below) may benefit from additional transfer mechanisms.",
      ],
    },
    {
      id: "marketing-communications",
      title: "Marketing Communications",
      blocks: [
        "We send promotional and marketing communications only with your consent and in accordance with your preferences. You may opt out of promotional messages at any time by replying STOP to any SMS, using the unsubscribe feature in emails, or adjusting your preferences in the in-app settings. Opting out does not affect service, transactional or legally required communications. Our SMS communications are conducted in accordance with applicable TRAI and DND regulations.",
        "No mobile information or consent data is shared with third parties or affiliates for marketing or promotional purposes. Text-messaging opt-in data and consent will not be shared with any third party.",
      ],
    },
    {
      id: "third-party-links-and-services",
      title: "Third-Party Links and Services",
      blocks: [
        "The Platform may contain links to, or integrate with, third-party websites or services that are not owned or operated by AstroRize. This Policy does not apply to those third parties; AstroRize has no control over their practices. Users are advised to review the privacy policies of any third-party site or service before providing personal data. AstroRize is not responsible for the privacy practices or content of any third-party site linked from the Platform.",
      ],
    },
    {
      id: "data-breach-notification",
      title: "Data-Breach Notification",
      blocks: [
        "AstroRize maintains procedures to detect, assess, contain and respond to personal-data breaches. Where a breach is reasonably likely to result in harm to affected Data Principals, AstroRize will notify the Data Protection Board of India and the affected Data Principals in the manner and within the timeframe required by the DPDP Act and any rules made thereunder, and will take steps to mitigate any resulting harm.",
      ],
    },
    {
      id: "region-specific-privacy-rights",
      title: "Region-Specific Privacy Rights",
      blocks: [
        { lead: "EEA / United Kingdom (GDPR / UK GDPR).", text: "If you are located in the European Economic Area or the United Kingdom and AstroRize offers services in your jurisdiction, our lawful bases for processing include consent, performance of a contract, legal obligation and legitimate interests. You have rights to access, rectification, erasure, restriction of processing, data portability and objection, and to lodge a complaint with your local supervisory authority. International transfers from the EEA/UK rely on appropriate safeguards such as Standard Contractual Clauses. An EU/UK representative and a Data Protection Officer will be appointed where required by applicable law." },
        { lead: "California, USA (CCPA/CPRA).", text: 'If you are a California resident and AstroRize offers services in your jurisdiction, you have rights to know, access, correct and delete your personal information, and to opt out of the sale or sharing of personal information. AstroRize does not sell personal information. You may exercise your rights through the contacts in this Policy or via a "Do Not Sell or Share My Personal Information" link where applicable. AstroRize will not discriminate against you for exercising these rights.' },
        "These regional modules apply only once AstroRize actively offers services to users in those jurisdictions. Until then, access from those regions may be geo-restricted.",
      ],
    },
    {
      id: "grievance-officer-and-data-protection-contact",
      title: "Grievance Officer and Data-Protection Contact",
      blocks: [
        "AstroRize has appointed a Grievance Officer in accordance with the Information Technology Act, 2000, and a data-protection contact for DPDP Act–related matters.",
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
    {
      id: "severability-and-dispute-resolution",
      title: "Severability and Dispute Resolution",
      blocks: [
        "This Policy shall be governed by and construed in accordance with the laws of India. Best efforts are made to ensure this Policy adheres to applicable laws. If any provision is held invalid, that provision will not affect the validity of the remainder of this Policy. Any dispute arising out of or relating to this Policy shall be resolved in accordance with the dispute-resolution mechanism in the Terms & Conditions.",
      ],
    },
    {
      id: "changes-to-this-policy",
      title: "Changes to this Policy",
      blocks: [
        "AstroRize may update this Policy from time to time. For material changes, we will provide reasonable prior notice — for example, through an in-app message or email — and, where required by applicable law (including the DPDP Act), we will seek fresh consent before the changed processing commences. The effective date and version number at the top of this Policy reflect the current version. The effective date of this Policy reflects the current version.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      blocks: ["AstroRize Private Limited · D-E-407, MPR Urban City, Patiganpur, Patencheru, Hyderabad, 502319 · Privacy: privacy@astrorize.com · Support: support@astrorize.com"],
    },
  ],
};
