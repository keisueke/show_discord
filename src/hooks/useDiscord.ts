import { useEffect, useState } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID || 'mock_id');

interface DiscordContext {
    sdk: DiscordSDK;
    ready: boolean;
    authenticated: boolean;
    user: {
        id: string;
        username: string;
        discriminator: string;
        avatar?: string;
    } | null;
}

export const useDiscord = () => {
    const [context, setContext] = useState<DiscordContext>({
        sdk: discordSdk,
        ready: false,
        authenticated: false,
        user: null,
    });

    useEffect(() => {
        const setup = async () => {
            // If running in top-level window (not iframe), likely local dev or github pages direct view
            // Force mock mode immediately
            if (window.parent === window) {
                setContext(prev => ({
                    ...prev,
                    ready: true,
                    authenticated: true,
                    user: { id: "mock_user", username: "MockUser", discriminator: "0000" }
                }));
                return;
            }

            try {
                // Wait for ready with timeout for local dev
                await Promise.race([
                    discordSdk.ready(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Discord SDK timeout')), 2000))
                ]);

                // Authorize with Discord Client
                await discordSdk.commands.authorize({
                    client_id: import.meta.env.VITE_DISCORD_CLIENT_ID || 'mock_id',
                    response_type: 'code',
                    state: '',
                    prompt: 'none',
                    scope: [
                        'identify',
                        'rpc.activities.write',
                    ],
                });

                // Authenticate
                const response = await discordSdk.commands.authenticate({
                    access_token: 'mock_token'
                });
                setContext(prev => ({ ...prev, ready: true, authenticated: true, user: response.user as any }));

            } catch (e) {
                console.warn("Discord SDK initialization failed or timed out (expected in local dev):", e);
                // Fallback for browser testing
                setContext(prev => ({
                    ...prev,
                    ready: true,
                    authenticated: true,
                    user: { id: `user_${Math.floor(Math.random() * 1000)}`, username: "TestUser", discriminator: "0000" }
                }));
            }
        };

        setup();
    }, []);

    return context;
};
