# Chatbot simple (Groq)

Chatbot web minimal : serveur Python sans dépendance + page statique, réponses en streaming via l'API Groq
(modèle économique `llama-3.1-8b-instant` par défaut).

## Démarrage

```bash
cp .env.example .env   # puis renseigner GROQ_API_KEY dans .env
python3 server.py      # http://127.0.0.1:8000
```

Variables : `GROQ_API_KEY` (obligatoire), `GROQ_MODEL`, `SYSTEM_PROMPT`, `HOST`, `PORT`.
