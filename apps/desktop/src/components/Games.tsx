import { useEffect, useState } from 'react';
import { WINKS } from '@nacio/shared';
import { useApp } from '../store';
import { Modal } from './Modals';

type GameTab = 'dados' | 'tateti' | 'ppt';

export function GamesModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<GameTab>('dados');

  return (
    <Modal title="Juegos" onClose={onClose} wide>
      <div className="game-tabs">
        <button type="button" className={tab === 'dados' ? 'active' : ''} onClick={() => setTab('dados')}>
          🎲 Dados
        </button>
        <button type="button" className={tab === 'tateti' ? 'active' : ''} onClick={() => setTab('tateti')}>
          ⭕ Ta-te-tí
        </button>
        <button type="button" className={tab === 'ppt' ? 'active' : ''} onClick={() => setTab('ppt')}>
          ✊ Piedra, papel o tijera
        </button>
      </div>

      {tab === 'dados' && <DiceGame />}
      {tab === 'tateti' && <TicTacToe />}
      {tab === 'ppt' && <RockPaperScissors />}
    </Modal>
  );
}

function DiceGame() {
  const sendDice = useApp((state) => state.sendDice);
  const connection = useApp((state) => state.connection);
  const [rolling, setRolling] = useState(false);

  async function roll() {
    setRolling(true);
    await sendDice();
    setTimeout(() => setRolling(false), 500);
  }

  return (
    <section className="game-panel">
      <p className="game-help">
        Tirá dos dados y el resultado se manda al chat para que lo vean todos.
      </p>
      <div className={`dice-row ${rolling ? 'rolling' : ''}`}>
        <span>🎲</span>
        <span>🎲</span>
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="big-button compact"
          onClick={() => void roll()}
          disabled={rolling || connection !== 'online'}
        >
          {rolling ? 'Tirando…' : 'Tirar los dados'}
        </button>
      </div>
      {connection !== 'online' && <p className="game-help">Necesitás conexión para jugar en el chat.</p>}
    </section>
  );
}

type Cell = 'X' | 'O' | null;

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function winnerOf(board: Cell[]): Cell {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]!;
  }
  return null;
}

function bestMove(board: Cell[]): number {
  const empty = board.map((cell, index) => (cell ? -1 : index)).filter((index) => index >= 0);
  const canWin = (mark: 'X' | 'O') => {
    for (const [a, b, c] of LINES) {
      const line = [board[a], board[b], board[c]];
      if (line.filter((cell) => cell === mark).length === 2 && line.includes(null)) {
        return [a, b, c][line.indexOf(null)]!;
      }
    }
    return -1;
  };
  const win = canWin('O');
  if (win >= 0) return win;
  const block = canWin('X');
  if (block >= 0) return block;
  if (board[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter((index) => board[index] === null);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)]!;
  return empty[Math.floor(Math.random() * empty.length)] ?? -1;
}

function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<'X' | 'O'>('X');
  const winner = winnerOf(board);
  const full = board.every(Boolean);

  useEffect(() => {
    if (turn !== 'O' || winner || full) return;
    const timer = setTimeout(() => {
      const index = bestMove(board);
      if (index < 0) return;
      setBoard((current) => {
        const next = [...current];
        next[index] = 'O';
        return next;
      });
      setTurn('X');
    }, 360);
    return () => clearTimeout(timer);
  }, [turn, board, winner, full]);

  function play(index: number) {
    if (board[index] || winner || turn !== 'X') return;
    setBoard((current) => {
      const next = [...current];
      next[index] = 'X';
      return next;
    });
    setTurn('O');
  }

  function reset() {
    setBoard(Array(9).fill(null));
    setTurn('X');
  }

  const message = winner
    ? winner === 'X'
      ? '¡Ganaste! 🎉'
      : 'Ganó la compu 🤖'
    : full
      ? 'Empate.'
      : turn === 'X'
        ? 'Te toca: X'
        : 'Pensando…';

  return (
    <section className="game-panel">
      <p className="game-help">Ta-te-tí contra la computadora. Vos jugás con X.</p>
      <div className="ttt-board">
        {board.map((cell, index) => (
          <button
            key={index}
            type="button"
            className={`ttt-cell ${cell ? cell.toLowerCase() : ''}`}
            onClick={() => play(index)}
            disabled={Boolean(cell) || Boolean(winner) || turn !== 'X'}
          >
            {cell ?? ''}
          </button>
        ))}
      </div>
      <p className="game-status">{message}</p>
      <div className="modal-actions">
        <button type="button" className="mini-button" onClick={reset}>
          Reiniciar
        </button>
      </div>
    </section>
  );
}

type Move = 'piedra' | 'papel' | 'tijera';

const MOVES: { id: Move; emoji: string; label: string }[] = [
  { id: 'piedra', emoji: '✊', label: 'Piedra' },
  { id: 'papel', emoji: '✋', label: 'Papel' },
  { id: 'tijera', emoji: '✌️', label: 'Tijera' },
];

function resultOf(player: Move, rival: Move): 'win' | 'lose' | 'tie' {
  if (player === rival) return 'tie';
  if (
    (player === 'piedra' && rival === 'tijera') ||
    (player === 'papel' && rival === 'piedra') ||
    (player === 'tijera' && rival === 'papel')
  ) {
    return 'win';
  }
  return 'lose';
}

function RockPaperScissors() {
  const [player, setPlayer] = useState<Move | null>(null);
  const [rival, setRival] = useState<Move | null>(null);
  const [score, setScore] = useState({ win: 0, lose: 0, tie: 0 });

  function choose(move: Move) {
    const rivalMove = MOVES[Math.floor(Math.random() * MOVES.length)]!.id;
    setPlayer(move);
    setRival(rivalMove);
    setScore((current) => {
      const result = resultOf(move, rivalMove);
      return { ...current, [result]: current[result] + 1 };
    });
  }

  const result = player && rival ? resultOf(player, rival) : null;

  return (
    <section className="game-panel">
      <p className="game-help">Elegí tu jugada y la computadora responde al instante.</p>
      <div className="rps-options">
        {MOVES.map((move) => (
          <button key={move.id} type="button" className="rps-button" onClick={() => choose(move.id)}>
            <span>{move.emoji}</span>
            <small>{move.label}</small>
          </button>
        ))}
      </div>
      {player && rival && (
        <div className="rps-result">
          <span>{MOVES.find((move) => move.id === player)?.emoji}</span>
          <strong>
            {result === 'win' ? 'Ganaste' : result === 'lose' ? 'Perdiste' : 'Empate'}
          </strong>
          <span>{MOVES.find((move) => move.id === rival)?.emoji}</span>
        </div>
      )}
      <p className="game-status">
        Ganadas {score.win} · Perdidas {score.lose} · Empates {score.tie}
      </p>
    </section>
  );
}

export function ActivitiesModal({ onClose }: { onClose: () => void }) {
  const sendWink = useApp((state) => state.sendWink);
  const connection = useApp((state) => state.connection);

  return (
    <Modal title="Actividades" onClose={onClose}>
      <p className="modal-help">Mandá un guiño animado a la conversación.</p>
      <div className="wink-grid">
        {WINKS.map((wink) => (
          <button
            key={wink.id}
            type="button"
            className="wink-button"
            disabled={connection !== 'online'}
            onClick={() => void sendWink(wink.id)}
          >
            <span>{wink.emoji}</span>
            <small>{wink.label}</small>
          </button>
        ))}
      </div>
      {connection !== 'online' && (
        <p className="game-help">Necesitás conexión para mandar guiños.</p>
      )}
    </Modal>
  );
}
