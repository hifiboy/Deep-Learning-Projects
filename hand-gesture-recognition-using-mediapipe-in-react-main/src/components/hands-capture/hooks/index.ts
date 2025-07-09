// GestureRecognition.tsx - Includes Sidebar for Operator Selection

import { Ref, useEffect, useRef, useState } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import {
  drawConnectors,
  drawLandmarks,
  drawRectangle,
} from '@mediapipe/drawing_utils';
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import useKeyPointClassifier from '../hooks/useKeyPointClassifier';
import CONFIGS from '../../../../constants';

const maxVideoWidth = window.innerWidth;
const maxVideoHeight = window.innerHeight;

interface IHandGestureLogic {
  videoElement: Ref<any>;
  canvasEl: Ref<any>;
  selectedOperation: string;
  setSelectedOperation: (val: string) => void;
}

function useGestureRecognition({ videoElement, canvasEl, selectedOperation, setSelectedOperation }: IHandGestureLogic) {
  const hands = useRef<any>(null);
  const camera = useRef<any>(null);
  const handsGesture = useRef<string[]>([]);
  const lastPredictTime = useRef<number>(0);
  const lastSpokenExpression = useRef<string>('');

  const { processLandmark } = useKeyPointClassifier();

  const countExtendedFingers = (landmarks: any[], handedness: string): number => {
    const tips = [8, 12, 16, 20];
    let count = 0;
    for (let i = 0; i < tips.length; i++) {
      const tip = landmarks[tips[i]];
      const pip = landmarks[tips[i] - 2];
      if (tip.y < pip.y) count++;
    }
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const thumbCMC = landmarks[1];
    if (handedness === 'Right') {
      if (thumbTip.x < thumbIP.x && thumbTip.x < thumbCMC.x) count++;
    } else {
      if (thumbTip.x > thumbIP.x && thumbTip.x > thumbCMC.x) count++;
    }
    return count;
  };

  const numberToWords = (num: number) => {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    return words[num] || num.toString();
  };

  async function onResults(results) {
    if (!canvasEl.current) return;
    const ctx = canvasEl.current.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvasEl.current.width, canvasEl.current.height);
    ctx.drawImage(results.image, 0, 0, maxVideoWidth, maxVideoHeight);

    let expression = '';
    let result = 0;
    const currentTime = Date.now();

    if (results.multiHandLandmarks) {
      const fingerCounts: number[] = [];

      for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
        const handedness = results.multiHandedness?.[index]?.label || 'Right';
        const landmarksX = landmarks.map((l) => l.x);
        const landmarksY = landmarks.map((l) => l.y);

        if (currentTime - lastPredictTime.current > 500) {
          const prediction = await processLandmark(landmarks, results.image);
          handsGesture.current[index] = CONFIGS.keypointClassifierLabels[prediction];
          lastPredictTime.current = currentTime;
        }

        const label = handsGesture.current[index] || '?';
        const extendedFingers = countExtendedFingers(landmarks, handedness);
        fingerCounts.push(extendedFingers);

        ctx.fillStyle = '#ff0000';
        ctx.font = '24px serif';
        ctx.fillText(
          `Gesture: ${label} | Fingers: ${extendedFingers}`,
          maxVideoWidth * Math.min(...landmarksX),
          maxVideoHeight * Math.min(...landmarksY) - 15
        );

        drawRectangle(
          ctx,
          {
            xCenter:
              Math.min(...landmarksX) +
              (Math.max(...landmarksX) - Math.min(...landmarksX)) / 2,
            yCenter:
              Math.min(...landmarksY) +
              (Math.max(...landmarksY) - Math.min(...landmarksY)) / 2,
            width: Math.max(...landmarksX) - Math.min(...landmarksX),
            height: Math.max(...landmarksY) - Math.min(...landmarksY),
            rotation: 0,
          },
          {
            fillColor: 'transparent',
            color: '#ff0000',
            lineWidth: 1,
          }
        );

        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
          color: '#00ffff',
          lineWidth: 2,
        });
        drawLandmarks(ctx, landmarks, {
          color: '#ffff29',
          lineWidth: 1,
        });
      }

      if (fingerCounts.length === 2) {
        let opSymbol = '+';
        let opWord = 'plus';
        if (selectedOperation === 'subtract') {
          result = fingerCounts[0] - fingerCounts[1];
          opSymbol = '-';
          opWord = 'minus';
        } else if (selectedOperation === 'multiply') {
          result = fingerCounts[0] * fingerCounts[1];
          opSymbol = '×';
          opWord = 'times';
        } else {
          result = fingerCounts[0] + fingerCounts[1];
        }

        expression = `${fingerCounts[0]} ${opSymbol} ${fingerCounts[1]}`;

        const sentence = `${numberToWords(fingerCounts[0])} ${opWord} ${numberToWords(fingerCounts[1])} equals ${numberToWords(result)}`;

        if (sentence !== lastSpokenExpression.current) {
          const utterance = new SpeechSynthesisUtterance(sentence);
          utterance.lang = 'en-IN';
          speechSynthesis.cancel();
          speechSynthesis.speak(utterance);
          lastSpokenExpression.current = sentence;
        }

        const text = `Expression: ${expression} = ${result}`;
        ctx.font = '30px bold';
        const textWidth = ctx.measureText(text).width;
        const boxX = (maxVideoWidth - textWidth) / 2 - 20;
        const boxY = maxVideoHeight - 70;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.roundRect(boxX, boxY, textWidth + 40, 50, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.fillText(text, boxX + 20, boxY + 35);
      }
    }

    ctx.restore();
  }

  const loadHands = () => {
    hands.current = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.current.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    hands.current.onResults(onResults);
  };

  useEffect(() => {
    (async function initCamera() {
      camera.current = new Camera(videoElement.current, {
        onFrame: async () => {
          await hands.current.send({ image: videoElement.current });
        },
        width: maxVideoWidth,
        height: maxVideoHeight,
      });
      camera.current.start();
    })();
    loadHands();
  }, []);

  return {
    maxVideoHeight,
    maxVideoWidth,
    canvasEl,
    videoElement,
    setSelectedOperation,
  };
}

export default useGestureRecognition;