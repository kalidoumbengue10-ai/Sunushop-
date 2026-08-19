"use client";

import type { InputHTMLAttributes } from "react";

type SenegalPhoneInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange" | "name"
> & {
  value: string;
  onChange: (phone: string) => void;
};

export function senegalNationalNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return (digits.startsWith("221") ? digits.slice(3) : digits).slice(0, 9);
}

export function toSenegalPhone(value: string) {
  return `+221${senegalNationalNumber(value)}`;
}

export function SenegalPhoneInput({ value, onChange, ...props }: SenegalPhoneInputProps) {
  const nationalNumber = senegalNationalNumber(value);

  return (
    <span className="senegal-phone-input">
      <span className="senegal-phone-input__prefix" aria-hidden="true">+221</span>
      <input
        {...props}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={nationalNumber}
        pattern="[0-9]{9}"
        placeholder="77 000 00 00"
        onChange={(event) => onChange(toSenegalPhone(event.target.value))}
      />
    </span>
  );
}
