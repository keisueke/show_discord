import { useEffect, useRef, useState, useCallback } from 'react';
import { Howl, Howler } from 'howler';

export type SoundName =
    | 'bgm_lobby'
    | 'bgm_game'
    | 'se_start'
    | 'se_question'
    | 'se_drumroll'
    | 'se_result'
    | 'se_cheer'
    | 'se_buzzer'
    | 'se_countdown';

const SOUND_PATHS: Record<SoundName, string> = {
    bgm_lobby: './sounds/bgm_lobby.mp3',
    bgm_game: './sounds/bgm_game.mp3',
    se_start: './sounds/se_start.mp3',
    se_question: './sounds/se_question.mp3',
    se_drumroll: './sounds/se_drumroll.mp3',
    se_result: './sounds/se_result.mp3',
    se_cheer: './sounds/se_cheer.mp3',
    se_buzzer: './sounds/se_buzzer.mp3',
    se_countdown: './sounds/se_countdown.mp3',
};

export const useSounds = () => {
    const [muted, setMuted] = useState(false);
    const bgmRef = useRef<Howl | null>(null);
    const currentBgmName = useRef<SoundName | null>(null);

    // Initialize global mute state
    useEffect(() => {
        Howler.mute(muted);
    }, [muted]);

    const playSE = useCallback((name: SoundName) => {
        const sound = new Howl({
            src: [SOUND_PATHS[name]],
            volume: 0.6,
        });
        sound.play();
    }, []);

    const playBGM = useCallback((name: SoundName) => {
        if (currentBgmName.current === name && bgmRef.current?.playing()) return;

        // Fade out old BGM
        if (bgmRef.current) {
            const oldBgm = bgmRef.current;
            oldBgm.fade(0.4, 0, 1000);
            setTimeout(() => oldBgm.stop(), 1000);
        }

        // Start new BGM
        const newBgm = new Howl({
            src: [SOUND_PATHS[name]],
            loop: true,
            volume: 0, // Start at 0 for fade in
        });

        newBgm.play();
        newBgm.fade(0, 0.4, 1000); // Fade in to 0.4

        bgmRef.current = newBgm;
        currentBgmName.current = name;
    }, []);

    const stopBGM = useCallback(() => {
        if (bgmRef.current) {
            bgmRef.current.fade(0.4, 0, 1000);
            setTimeout(() => {
                bgmRef.current?.stop();
                bgmRef.current = null;
                currentBgmName.current = null;
            }, 1000);
        }
    }, []);

    const toggleMute = useCallback(() => {
        setMuted(prev => !prev);
    }, []);

    return {
        playSE,
        playBGM,
        stopBGM,
        toggleMute,
        muted
    };
};
