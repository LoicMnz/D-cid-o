import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import styles from './App.module.css';

type Choice = { id: string; label: string; weight: number };

const STORAGE_KEY = 'decideo:choices:v2';
const MIN_WEIGHT = 1;
const MAX_WEIGHT = 99;
const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function randomIndex(max: number) {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] % max;
}

function shuffle<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function clampWeight(weight: number) {
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(weight)));
}

function normalizeChoices(value: unknown): Choice[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const choice = item as Partial<Choice>;
    if (typeof choice.id !== 'string' || typeof choice.label !== 'string') return [];
    const weight = typeof choice.weight === 'number' && Number.isFinite(choice.weight)
      ? clampWeight(choice.weight)
      : MIN_WEIGHT;
    return [{ id: choice.id, label: choice.label, weight }];
  });
}

function pickWeightedChoice(choices: Choice[]) {
  const totalWeight = choices.reduce((total, choice) => total + choice.weight, 0);
  let target = (randomIndex(0x100000000) / 0x100000000) * totalWeight;

  for (const choice of choices) {
    target -= choice.weight;
    if (target < 0) return choice.id;
  }

  return choices.at(-1)!.id;
}

export default function App() {
  const reduceMotion = useReducedMotion();
  const [choices, setChoices] = useState<Choice[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState('Ajoute au moins deux choix pour commencer.');
  const [storageReady, setStorageReady] = useState(false);

  const visibleChoices = useMemo(
    () => choices.filter((choice) => !eliminated.has(choice.id)),
    [choices, eliminated],
  );
  const winner = choices.find((choice) => choice.id === winnerId);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setChoices(normalizeChoices(JSON.parse(saved)));
    } catch {
      // Le stockage local est un confort, pas une condition de fonctionnement.
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices));
  }, [choices, storageReady]);

  function reset(messageText = 'Prêt pour un nouveau plouf-plouf.') {
    setEliminated(new Set());
    setActiveId(null);
    setWinnerId(null);
    setMessage(messageText);
  }

  function addChoice(event: FormEvent) {
    event.preventDefault();
    const label = newLabel.trim().slice(0, 32);
    if (!label) return setMessage('Donne un nom à ton choix.');
    if (choices.some((choice) => choice.label.toLowerCase() === label.toLowerCase())) {
      return setMessage('Ce choix est déjà dans la grille.');
    }

    setChoices((current) => [...current, { id: crypto.randomUUID(), label, weight: MIN_WEIGHT }]);
    setNewLabel('');
    reset(`« ${label} » rejoint la partie.`);
  }

  function removeChoice(id: string) {
    setChoices((current) => current.filter((choice) => choice.id !== id));
    reset('Choix retiré.');
  }

  function beginEdit(choice: Choice) {
    setEditingId(choice.id);
    setEditingLabel(choice.label);
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault();
    const label = editingLabel.trim().slice(0, 32);
    if (!editingId || !label) return;
    setChoices((current) =>
      current.map((choice) => (choice.id === editingId ? { ...choice, label } : choice)),
    );
    setEditingId(null);
    reset('Choix modifié.');
  }

  function updateWeight(id: string, nextWeight: number) {
    if (!Number.isFinite(nextWeight)) return;
    setChoices((current) =>
      current.map((choice) =>
        choice.id === id ? { ...choice, weight: clampWeight(nextWeight) } : choice,
      ),
    );
    reset('Poids modifié.');
  }

  async function draw() {
    if (choices.length < 2 || isRunning) return;

    setEditingId(null);
    setEliminated(new Set());
    setWinnerId(null);
    setIsRunning(true);
    setMessage('Plouf… plouf…');

    const winner = pickWeightedChoice(choices);
    const losers = shuffle(choices.filter((choice) => choice.id !== winner).map((choice) => choice.id));
    let remaining = choices.map((choice) => choice.id);

    for (const loser of losers) {
      if (!reduceMotion) {
        const start = randomIndex(remaining.length);
        for (let hop = 0; hop < Math.min(4, remaining.length + 1); hop += 1) {
          setActiveId(remaining[(start + hop) % remaining.length]);
          await wait(90 + hop * 12);
        }
      }
      setActiveId(loser);
      await wait(reduceMotion ? 70 : 150);
      setEliminated((current) => new Set([...current, loser]));
      remaining = remaining.filter((id) => id !== loser);
      await wait(reduceMotion ? 30 : 80);
    }

    setActiveId(winner);
    setWinnerId(winner);
    setIsRunning(false);
    setMessage('C’est décidé !');
  }

  return (
    <main className={styles.app}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" aria-hidden="true" />
            Décidéo
          </div>
        </header>

        <section className={styles.intro}>
          <h1>Qu’est-ce qui te fait envie ?</h1>
          <span>Fais ton choix.</span>
        </section>

        <form className={styles.addForm} onSubmit={addChoice}>
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Ex. Ramen"
            aria-label="Nouveau choix"
            maxLength={32}
            disabled={isRunning}
          />
          <button type="submit" disabled={isRunning}><b aria-hidden="true">＋</b> Ajouter</button>
        </form>

        <div className={styles.listHeader}>
          <span><strong>{choices.length}</strong> choix</span>
          {choices.length > 0 && !isRunning && (
            <button onClick={() => { setChoices([]); reset('Ajoute une nouvelle envie.'); }}>
              Tout effacer
            </button>
          )}
        </div>

        <section className={styles.game} aria-label="Grille des choix">
          {choices.length === 0 ? (
            <div className={styles.empty}><b>✶</b><strong>La grille t’attend</strong><span>Ajoute au moins deux possibilités.</span></div>
          ) : (
            <motion.div className={styles.grid} layout>
              <AnimatePresence mode="popLayout">
                {visibleChoices.map((choice, index) => {
                  const isWinner = choice.id === winnerId;
                  const isActive = choice.id === activeId;
                  return (
                    <motion.article
                      layout
                      key={choice.id}
                      className={`${styles.card} ${isActive ? styles.active : ''} ${isWinner ? styles.winner : ''}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: isActive ? 1.025 : 1 }}
                      exit={{ opacity: 0, scale: 0.72, y: -12 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 27 }}
                    >
                      {editingId === choice.id ? (
                        <form className={styles.edit} onSubmit={saveEdit}>
                          <input autoFocus value={editingLabel} onChange={(event) => setEditingLabel(event.target.value)} maxLength={32} />
                          <div><button type="submit">Valider</button><button type="button" onClick={() => setEditingId(null)}>Annuler</button></div>
                        </form>
                      ) : (
                        <>
                          <small>{String(index + 1).padStart(2, '0')}</small>
                          <h2>{choice.label}</h2>
                          {!isRunning && !winnerId && (
                            <>
                              <div className={styles.cardActions}>
                                <button aria-label={`Modifier ${choice.label}`} onClick={() => beginEdit(choice)}>Modifier</button>
                                <button aria-label={`Supprimer ${choice.label}`} onClick={() => removeChoice(choice.id)}>×</button>
                              </div>
                              <div className={styles.weightEditor}>
                                <span>Poids</span>
                                <div className={styles.weightControl}>
                                  <button
                                    type="button"
                                    aria-label={`Diminuer le poids de ${choice.label}`}
                                    disabled={choice.weight <= MIN_WEIGHT}
                                    onClick={() => updateWeight(choice.id, choice.weight - 1)}
                                  >−</button>
                                  <input
                                    type="number"
                                    min={MIN_WEIGHT}
                                    max={MAX_WEIGHT}
                                    inputMode="numeric"
                                    value={choice.weight}
                                    aria-label={`Poids de ${choice.label}`}
                                    onChange={(event) => updateWeight(choice.id, event.currentTarget.valueAsNumber)}
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Augmenter le poids de ${choice.label}`}
                                    disabled={choice.weight >= MAX_WEIGHT}
                                    onClick={() => updateWeight(choice.id, choice.weight + 1)}
                                  >+</button>
                                </div>
                              </div>
                            </>
                          )}
                          {isWinner && <em>Le choix du hasard</em>}
                        </>
                      )}
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </section>

        <output className={styles.status} aria-live="polite">
          <span>{message}</span>{winner && <strong>{winner.label}</strong>}
        </output>

        <div className={styles.actions}>
          <button className={styles.draw} onClick={() => void draw()} disabled={choices.length < 2 || isRunning}>
            {winner ? '↻ Rejouer' : isRunning ? 'Plouf… plouf…' : '✶ Lancer le plouf-plouf'}
          </button>
          {winner && <button className={styles.removeWinner} onClick={() => removeChoice(winner.id)}>Retirer {winner.label}</button>}
        </div>
      </div>
    </main>
  );
}
