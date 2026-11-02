import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Directive `v-reveal` : apparition douce au défilement, animée avec GSAP (ScrollTrigger).
 *  - `v-reveal`                : l'élément monte de 24 px en fondu quand il entre dans l'écran ;
 *  - `v-reveal.stagger`        : ses enfants directs apparaissent en cascade ;
 *  - `v-reveal="{ delay: .15, y: 16 }"` : réglages (secondes / pixels).
 * Le HTML rendu côté serveur reste visible (aucune page vide sans JavaScript) ; l'animation ne
 * se joue qu'une fois, et pas du tout si l'utilisateur a demandé de réduire les animations.
 */
interface RevealOptions { delay?: number; y?: number; duration?: number }

export default defineNuxtPlugin((nuxtApp) => {
  gsap.registerPlugin(ScrollTrigger)

  nuxtApp.vueApp.directive<HTMLElement, RevealOptions | undefined>('reveal', {
    mounted(el, binding) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const { delay = 0, y = 24, duration = 0.7 } = binding.value ?? {}
      const targets = binding.modifiers.stagger ? Array.from(el.children) : el
      if (binding.modifiers.stagger && !(targets as Element[]).length) return
      gsap.from(targets, {
        autoAlpha: 0,
        y,
        duration,
        delay,
        ease: 'power3.out',
        stagger: binding.modifiers.stagger ? 0.08 : 0,
        clearProps: 'opacity,visibility,transform',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true }
      })
    },
    // Rendu serveur : aucun style caché, l'animation est purement côté navigateur.
    getSSRProps: () => ({})
  })
})
