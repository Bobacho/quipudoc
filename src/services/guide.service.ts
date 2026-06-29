import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import * as db from '../database';

type MarkedInstance = { parse: (md: string, options?: unknown) => Promise<string> };
let _marked: MarkedInstance | undefined;
async function getMarked(): Promise<MarkedInstance> {
	if (!_marked) _marked = (await import('marked')).marked as MarkedInstance;
	return _marked;
}

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

async function extractPdfText(filePath: string): Promise<{ text: string; pageCount: number }> {
	const pdfBuffer = fs.readFileSync(filePath);
	const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
	const textResult = await parser.getText();
	await parser.destroy();
	return { text: textResult.text, pageCount: textResult.total };
}

function saveTxtFile(originalFilename: string, text: string): string {
	const baseName = originalFilename.replace(/\.pdf$/i, '');
	const txtName = `${baseName}_${Date.now()}.txt`;
	const txtPath = path.join(UPLOADS_DIR, txtName);
	fs.writeFileSync(txtPath, text, 'utf-8');
	return txtName;
}

const MAX_TOKENS = 5000;
const CHARS_PER_TOKEN = 4;

function truncateToTokenBudget(texts: string[], budget: number): string[] {
	const totalChars = texts.reduce((s, t) => s + t.length, 0);
	const maxChars = budget * CHARS_PER_TOKEN;

	if (totalChars <= maxChars) return texts;

	if (texts.length === 1) {
		return [texts[0].slice(0, maxChars)];
	}

	const ratio = maxChars / totalChars;
	let remaining = maxChars;
	const result: string[] = [];

	for (let i = 0; i < texts.length; i++) {
		const allowed = i < texts.length - 1
			? Math.floor(texts[i].length * ratio)
			: remaining;
		result.push(texts[i].slice(0, Math.max(allowed, 200)));
		remaining -= result[i].length;
	}

	return result;
}

async function callGroq(params: {
	title: string;
	summary: string;
	bankArea: string;
	category: string;
	question: string;
	contentMd?: string;
	documentTexts: string[];
}): Promise<string> {
	const apiKey = process.env.GROQ_API_KEY || process.env.API_KEY;
	if (!apiKey) throw new Error('GROQ_API_KEY no configurada en .env');

	const systemContent =
		'Eres un asistente experto del Banco de la Nación que genera guías informativas claras y bien estructuradas en formato Markdown.';

	const overhead = systemContent.length + params.title.length + params.summary.length + params.question.length + (params.contentMd?.length || 0) + 500;
	const docBudget = Math.max(1000, MAX_TOKENS * CHARS_PER_TOKEN - overhead);
	const truncated = truncateToTokenBudget(params.documentTexts, Math.floor(docBudget / CHARS_PER_TOKEN));

	const contextText = truncated
		.map((text, i) => `--- Documento ${i + 1} ---\n${text}`)
		.join('\n\n');

	const userContent = [
		`Título: ${params.title}`,
		`Resumen: ${params.summary}`,
		`Área del banco: ${params.bankArea || 'General'}`,
		`Categoría: ${params.category || 'General'}`,
		`Pregunta: ${params.question}`,
		params.contentMd ? `Instrucciones adicionales del usuario: ${params.contentMd}` : '',
		'',
		'Contexto extraído de los documentos:',
		contextText,
		'',
		'Genera una guía informativa en formato Markdown con la información proporcionada.',
	]
		.filter(Boolean)
		.join('\n');

	const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: 'llama-3.3-70b-versatile',
			messages: [
				{ role: 'system', content: systemContent },
				{ role: 'user', content: userContent },
			],
			max_tokens: 4096,
			temperature: 0.7,
		}),
	});

	if (!response.ok) {
		const errBody = await response.text();
		throw new Error(`Groq API error ${response.status}: ${errBody}`);
	}

	const data = (await response.json()) as {
		choices: Array<{ message: { content: string } }>;
	};
	return data.choices[0].message.content;
}

async function createGuide(
	formData: {
		title: string;
		summary: string;
		bankArea: string;
		category: string;
		question: string;
		contentMd?: string;
	},
	files: Express.Multer.File[],
): Promise<number> {
	const extractedDocs = (
		await Promise.all(
			files.map(async (file) => {
				if (!file.mimetype.includes('pdf') && !file.originalname.toLowerCase().endsWith('.pdf')) {
					return null;
				}
				try {
					const { text, pageCount } = await extractPdfText(file.path);
					saveTxtFile(file.originalname, text);
					const docId = db.insertDocument({
						filename: file.filename,
						originalName: file.originalname,
						pageCount,
						fileSize: file.size,
						extractedText: text,
					});
					return { id: docId, text };
				} catch (err) {
					console.error(`Error procesando PDF ${file.originalname}:`, err);
					return null;
				}
			}),
		)
	).filter((d): d is { id: number; text: string } => d !== null);

	const documentTexts = extractedDocs.map(d => d.text);

	const contentMd = await callGroq({
		title: formData.title,
		summary: formData.summary,
		bankArea: formData.bankArea,
		category: formData.category,
		question: formData.question,
		contentMd: formData.contentMd,
		documentTexts,
	});

	const marked = await getMarked();
	const contentHtml = await marked.parse(contentMd);

	const guideId = db.insertGuide({
		title: formData.title,
		summary: formData.summary,
		bankArea: formData.bankArea,
		category: formData.category,
		question: formData.question,
		contentMd: contentHtml,
		documentIds: extractedDocs.map(d => d.id),
	});

	return guideId;
}

export { createGuide };
