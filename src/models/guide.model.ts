import type { FormConfig } from './form.model';

function buildGuideFormConfig(bankAreas: string[], categories: string[]): FormConfig {
	return {
		title: 'Nueva Guía',
		action: '/guia/nueva',
		fields: [
			{ name: 'title', label: 'Título', type: 'text', required: true, placeholder: 'Título de la guía' },
			{ name: 'summary', label: 'Resumen', type: 'textarea', placeholder: 'Breve descripción de la guía' },
			/*	
						{
							name: 'bank_area',
							label: 'Área del banco',
							type: 'select',
							options: bankAreas.map(a => ({ value: a, label: a })),
						},
						{
							name: 'category',
							label: 'Categoría',
							type: 'select',
							options: categories.map(c => ({ value: c, label: c })),
						},*/
			{ name: 'question', label: 'Pregunta', type: 'textarea', required: true, placeholder: 'Pregunta que responde esta guía' },
			{ name: 'documents', label: 'Documentos de referencia', type: 'file', placeholder: 'Inserte los documentos para obtener un mejor contexto', repeatable: true },
			{ name: 'content_md', label: 'Contenido (Markdown)', type: 'textarea', required: true, placeholder: 'Inserte una pequena descripcion del contenido' },
		],
		submitLabel: 'Crear Guía',
		cancelUrl: '/repositorio',
	};
}

export { buildGuideFormConfig };
