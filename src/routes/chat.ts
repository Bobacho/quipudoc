import { Router, Request, Response } from 'express';
import * as db from '../database';

const router = Router();

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, sessionId } = req.body as { message?: string; sessionId?: string };

    if (!message || !sessionId) {
      res.status(400).json({ error: 'message y sessionId son requeridos' });
      return;
    }

    db.insertChatMessage(sessionId, 'user', message);

    const recentGuides = db.searchGuidesContext(message, 5);
    const guideContext = recentGuides.length > 0
      ? recentGuides.map(g => `- ${g.title}${g.summary ? ': ' + g.summary : ''}`).join('\n')
      : 'No hay guías disponibles en el repositorio.';

    const history = db.getChatMessages(sessionId, 20);
    const conversationHistory = history
      .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
      .join('\n');

    const apiKey = process.env.GROQ_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY no configurada');
    }

    const systemContent = `Eres un asistente experto del Banco de la Nación. Ayudas a los usuarios respondiendo preguntas sobre las guías del repositorio institucional.

Guías disponibles en el repositorio:
${guideContext}

Responde de forma clara y profesional usando la información de las guías cuando sea relevante. Si no encuentras la respuesta en las guías, indícalo al usuario.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: message },
        ],
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      throw new Error(`Groq API error ${groqRes.status}: ${errBody}`);
    }

    const data = (await groqRes.json()) as { choices: Array<{ message: { content: string } }> };
    const reply = data.choices[0].message.content;

    db.insertChatMessage(sessionId, 'assistant', reply);

    res.json({ reply });
  } catch (err) {
    console.error('Error en chat:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error desconocido' });
  }
});

export default router;
