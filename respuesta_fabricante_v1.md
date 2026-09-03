# Comentarios sobre el nuevo protocolo B — JAPAN TERAOKA serie TM

**Para:** Soporte técnico / I+D de JAPAN TERAOKA
**Asunto:** Pruebas del nuevo protocolo runtime (!0B…) en balanzas TM

---

Estimados amigos de JAPAN TERAOKA,

Esperamos que estén bien. Les escribimos porque hemos integrado y probado el **nuevo protocolo B** (!0B…/0b…) incorporado en la última actualización de firmware de las balanzas TM, y queríamos compartirles nuestra experiencia.

Antes que nada, queremos decirles que valoramos mucho este avance: disponer de un canal estable **balanza → PC** en tiempo real resuelve un problema histórico en nuestro flujo de POS. Los felicitamos por el trabajo.

Durante las pruebas surgieron dos puntos que nos gustaría conversar con ustedes, con la intención de encontrar juntos una solución. Antes de pedir cambios en el firmware, queremos confirmar el comportamiento, porque puede que haya algo que estemos pasando por alto de su lado.

Para evitar confusiones con la traducción, llamamos **Protocolo A** a los comandos de configuración existentes (`!0H`, `!0O`, `!0V`, `!0T`, `!0R`, `!0J`, `!0P`, puerto 4001) y **Protocolo B** al nuevo runtime (`!0BA`, `!0BQ`, `!0BS`, `!0BD`, `!0BV`, `!0BI`, `!0BO`, `!0BM`, `!0BC`, mismo puerto).

---

**Observación 1 — Coexistencia A + B (modo F vs modo N).**
En modo N el Protocolo B no responde. En modo F el Protocolo B funciona perfecto, pero los comandos del Protocolo A (`!0V` para PLU, `!0T`/`!0R` para etiquetas) dejan de tener efecto. En nuestro escenario necesitamos ambos en simultáneo: las balanzas reportando ventas en tiempo real (B) y, al mismo tiempo, poder reprogramar PLU y etiquetas remotamente (A) cuando cargamos catálogo o ajustamos diseños.

¿Esta exclusividad F/N es intencional del diseño actual, o podría ajustarse para que en modo F convivan A y B por la misma conexión TCP al 4001?

---

**Observación 2 — El `!0BS` (PRINT) sólo trae los ítems locales de la balanza.**
Nuestro caso de uso es un carrito compartido entre varias balanzas (frutas, panadería, fiambrería) y al final se cobra o imprime el ticket completo en cualquier balanza de la red. Vimos que:

- `!0BA` (acumular) sí se propaga bien: el host recibe los `0bA…` de cada balanza y reconstruye el carrito completo.
- Al pulsar PRINT, la secuencia `0bS` → `0bH` → `0bL × N` → `0bE` llega sólo con los ítems pesados en **esa** balanza. Los ítems añadidos desde las demás balanzas no aparecen en el ticket.

¿La balanza maneja un carrito local sin visibilidad de las otras, o existe algún mecanismo de sincronización que no estemos activando? Si es lo primero, ¿podrían considerar alguna de estas dos opciones?

- (a) que al recibir `!0BS` la balanza consulte al host el carrito completo y la respuesta `0bL × N` contenga todos los ítems acumulados, o
- (b) un `!0BS` extendido con flag de "carrito completo", indicando que el detalle lo envía el host.

Cualquiera de las dos nos resultaría muy útil. La condición indispensable es que **cualquier balanza pueda imprimir el ticket completo** de la venta, incluyendo ítems de las demás.

---

Quedamos a su disposición para compartir logs, ajustar nuestro código o coordinar una sesión remota si lo estiman útil. Muchas gracias por su tiempo y por la buena disposición que siempre nos han mostrado.

Un cordial saludo,
Equipo de integración POS
