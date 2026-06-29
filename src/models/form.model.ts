interface FormFieldOption {
  value: string;
  label: string;
}

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'email' | 'file' | 'url' | 'hidden';
  required?: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  helpText?: string;
  repeatable?: boolean;
}

interface FormConfig {
  title: string;
  action: string;
  method?: 'POST' | 'PUT';
  fields: FormField[];
  submitLabel?: string;
  cancelUrl?: string;
}

export type { FormFieldOption, FormField, FormConfig };
