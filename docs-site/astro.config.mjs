import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';

export default defineConfig({
    integrations: [
        mermaid(),
        starlight({
            title: 'Weather Starter Docs'
        })
    ]
});
