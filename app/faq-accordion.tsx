"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

type Faq = {
  question: string;
  answer: string;
};

export function FaqAccordion({ faqs }: { faqs: Faq[] }) {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="accordion">
      {faqs.map((item, index) => {
        const isOpen = openFaq === index;
        return (
          <div className={`faq-item ${isOpen ? "is-open" : ""}`} key={item.question}>
            <button
              onClick={() => setOpenFaq(isOpen ? -1 : index)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${index}`}
            >
              <span>{item.question}</span><ChevronDown size={18} />
            </button>
            <div id={`faq-answer-${index}`} className="faq-answer" aria-hidden={!isOpen}>
              <p>{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
