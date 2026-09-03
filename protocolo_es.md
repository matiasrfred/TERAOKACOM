# Protocolo de interfaz — Versión servidor

**Balanzas etiquetadoras JAPAN TERAOKA serie TM — traducción al español**

> Traducción y adaptación del documento oficial del protocolo (`docs/protocol.doc`,
> extracción de texto en `docs/protocol_extracted.txt`). Las referencias de marca fueron
> adaptadas a **JAPAN TERAOKA** y las menciones al software del fabricante a
> **JT-Scale Tool**. Las figuras del documento original no sobrevivieron a la extracción
> y no se incluyen. Donde el original es impreciso o deja campos sin documentar se agrega
> una nota del traductor marcada **[N. del T.]**, basada en la verificación contra una
> balanza real (ver `docs/protocol_notes_es.md` y `docs/SDK-integracion.md`).

## Observaciones generales

- Cada comando debe terminar con un carácter de fin invisible (hex: `0x0D`, `0x0A` o `0x03`).
- El número de puerto de la balanza JAPAN TERAOKA es: **4001**.

> **[N. del T.]** En la práctica verificada: enviar los comandos terminados en `0x0D 0x0A`
> (CR LF). Las respuestas de la balanza terminan en `0x0D 0x0A 0x03`. La balanza acepta un
> solo cliente TCP a la vez y un solo comando en vuelo.

---

## I. Borrado de registros de reporte

(El borrado de registros puede hacerse de forma independiente.)

```
!0HA
Respuesta: 0ha
```

> **[N. del T.]** Borra **todos** los registros de venta almacenados. Operación destructiva
> y sin deshacer.

---

## II. Parámetros de sistema

(Equivale a ingresar la función 39706 desde el teclado de la balanza y confirmar el acceso
a la configuración de parámetros.)

```
!0O010500010501010100000100010000000000000000000001
Respuesta: 0o01
```

Desglose del comando (24 campos de 2 dígitos, en este orden):

| Valor de ejemplo | Campo |
|---|---|
| `!0O` | Encabezado de protocolo |
| `01` | Número de balanza |
| `05` | Densidad de impresión |
| `00` | Aplicación de descuento |
| `01` | Tolerancia de redondeo |
| `05` | Tipo de código de barras |
| `01` | Formato de código de barras |
| `01` | Redondeo de bits |
| `01` | Formato de fecha |
| `00` | Unidad de peso neto |
| `00` | Unidad del precio unitario |
| `01` | Accionamiento del cajón de dinero |
| `00` | Selección de rango |
| `01` | Impresión en cero |
| `00` | Código de barras en papel continuo |
| `00` | Precisión de importes |
| `00` | Fuente del encabezado 1 |
| `00` | Fuente del encabezado 2 |
| `00` | Fuente del encabezado 3 |
| `00` | Fuente del encabezado 4 |
| `00` | Fuente del pie 1 |
| `00` | Fuente del pie 2 |
| `00` | Fuente del pie 3 |
| `00` | Fuente del pie 4 |
| `01` | Fuente del texto principal |

---

## III. Información de textos (slots 1–16: caracteres chinos/multibyte; 17–32: caracteres individuales)

(Este campo contiene el número de texto para la configuración de etiquetas — equivale a la
sección "Textos" de **JT-Scale Tool**. Para mostrar el texto correspondiente en las
etiquetas debe indicarse aquí el número de texto apropiado.)

Estructura del comando:

```
!0Z [encabezado] 01 [número de texto] A [delimitador]
    41472603208327102171555119511907 [códigos de posición del texto]
    0000 [termina con 4 ceros] B [marca de fin]
```

Ejemplo con respuesta:

```
!0Z01A414726032083271021715551195119070000B    Respuesta: 0z01
```

> **[N. del T.]** Los "códigos de posición" no se explican en el original: son códigos
> **área-posición GB2312** de 4 dígitos por carácter en los slots multibyte (el ASCII se
> mapea al área 3, formas de ancho completo: posición = codepoint − 0x20; espacio = `0101`),
> y códigos **ASCII decimales de 3 dígitos** en los slots de un byte (17–32), terminados
> en `000`. Ver `docs/SDK-integracion.md` §7.

Muestras del documento original (slots multibyte 1–16):

```
!0Z01A414726032083271021715551195119070000B
!0Z02A302754560000B
!0Z03A210528590000B
!0Z04A556028590000B
!0Z05A41901890405338580000B
!0Z06A1703544238580000B
!0Z07A380454560000B
!0Z08A351154560000B
!0Z09A1703207044852894032619034634233219170000B
!0Z10A421951352329230803262820421921400000B
!0Z11A169255162570248103260318035603180314032131430000B
!0Z12A2171271603260000B
!0Z13A215654230326414726034248298039373423031703200324032426370000B
!0Z14A0352036903880384031703200000B
!0Z15A52100000B
!0Z16A52100000B
```

Muestras (slots de un byte 17–32):

```
!0Z17A045000B
!0Z18A045000B
!0Z19A040000B
!0Z20A040107103041000B
!0Z21A040000B
!0Z22A047107103041000B
!0Z23A041000B
!0Z24A040107103041000B
!0Z25A040107103041000B
!0Z26A045000B
!0Z27A045000B
!0Z28A045000B
!0Z29A045000B
!0Z30A045000B
!0Z31A048050049045053048055054050056056049000B
!0Z32A048050049045053048055054050056056050000B
```

---

## IV. Información especial (slots 1–10: caracteres chinos/multibyte; 11–22: caracteres individuales)

La información especial se usa en dos modos: **modo etiqueta** y **modo cajero**.

**Uso en modo etiqueta:**

Corresponde al contenido asociado al número de información especial en "Información de
producto". Ejemplo: si el número de información especial de "Información especial 1" en la
etiqueta se fija en 10, su contenido pasa a ser el de "Información 10"; al seleccionar
"Información especial 1" en la configuración de etiquetas, la etiqueta impresa mostrará
"Información 10".

**Uso en modo cajero:**

Los números 1–4 corresponden al **encabezado** del ticket de caja; los números 5–8 al
**pie**.

**Explicación del protocolo:** análogo al protocolo de textos (sección III).

```
!0X01A034103780370037903170000B    Respuesta: 0x01
```

Muestras del documento original:

```
!0X01A034103780370037903170000B      ("Info1")
!0X02A034103780370037903180000B
!0X03A034103780370037903190000B
!0X04A034103780370037903200000B
!0X05A034103780370037903210000B
!0X06A034103780370037903220000B
!0X07A034103780370037903230000B
!0X08A034103780370037903240000B
!0X09A034103780370037903250000B
!0X10A0341037803700379031703160000B
!0X11A073110102111049049000B         ("Info11")
!0X12A073110102111049050000B
!0X13A073110102111049051000B
!0X14A073110102111049052000B
!0X15A073110102111049053000B
!0X16A073110102111049054000B
!0X17A073110102111049055000B
!0X18A073110102111049056000B
!0X19A073110102111049057000B
!0X20A073110102111050048000B
!0X21A073110102111050049000B
!0X22A073110102111050050000B
```

---

## V. Teclas rápidas (hotkeys)

(Equivale a la configuración de teclas rápidas de **JT-Scale Tool**.)

Las teclas 1–72 se configuran con dos comandos: `!0L00A…` (teclas 1–36) y `!0L01A…`
(teclas 37–72).

```
!0L00A000100020003000400050006000700080009001000110012001300140015001600170018001900200021002200230024002500260027002800290030003100320033003400350036B
!0L01A003700380039004000410042004300440045004600470048004900500051005200530054005500560057005800590060006100620063006400650066006700680069007000710072B
```

**Atención:** dentro de cada comando, **cada grupo de 4 dígitos es una tecla**. Las
posiciones se asignan secuencialmente de la 1 a la 36, y cada grupo contiene el número de
PLU correspondiente.

Ejemplo:

```
!0L00A000400060008003800050039000700400009001000110012...B
```

La tecla 1 corresponde al PLU 4, la tecla 2 al PLU 6 y la tecla 3 al PLU 8.

```
Respuesta: 0l00   (y 0l01 para la segunda trama)
```

---

## VI. Configuración de etiquetas

(Equivale al diseño de etiquetas de **JT-Scale Tool**.)

`!0T00A…` y `!0R00A…` forman **juntos** una entrada de etiqueta: `!0T…` es la parte
**no textual** y `!0R…` la parte **de textos**.

**Atención:**

- Las secciones no textual y de textos deben enviarse en **dos lotes separados**.
- Si tras la descarga la balanza no imprime el formato especificado, el número de etiqueta
  es incorrecto. Se ajusta pulsando **Función + 920xx** (donde `xx` es el número de
  etiqueta; por ejemplo, si el número descargado es 0 y la detección indica discrepancia,
  pulsar Función `92000` + Confirmar).

**Sección no textual:**

```
!0T [encabezado] 00 [número de etiqueta] A [delimitador]
    56 [ancho de impresión] 40 [alto de impresión]
    ... campos ...
```

Los parámetros no textuales van en el siguiente orden: nombre de producto → nota A →
nota B → código de producto → peso neto → tara → peso bruto → precio unitario
pre-descuento → total pre-descuento → peso neto promocional → precio unitario
promocional → precio unitario → precio total → fecha → hora → vida útil → número de
departamento → número de tienda → información especial 1 → información especial 2 →
información especial 3 → código de 13 dígitos → número de secuencia acumulada de
impresión → código de barras principal → código adicional.

- Salvo el código de barras principal y el código adicional, cada campo es un **grupo de
  6 dígitos** en el orden: **fuente → coordenada X → coordenada Y**.
- El código de barras principal y el código adicional son grupos de **8 dígitos** en el
  orden: **fuente → coordenada X → coordenada Y → altura del código de barras**.

> **[N. del T.]** El cuerpo de `!0T` mide entonces 4 + 23×6 + 2×8 = **158 caracteres**
> (los ejemplos del documento original son inconsistentes entre sí; este largo es el que
> acepta la balanza real).

**Sección de textos:**

```
!0R00A110234030211031711113219033611030230000000000000000000000000...
```

`!0R…` representa la sección de textos; análoga a la no textual, en el orden TEXT1,
TEXT2, … (32 entradas de 6 dígitos: fuente → X → Y; cuerpo de **192 caracteres**).

Ejemplo completo con respuestas:

```
!0T00A56401517070000000000001944210000000000000000000000000000000303150318150000002332261936151950151914300000000000000334300000000000000000000301030302260700000007
Respuesta: 0t00

!0R00A110234030211031711113219033611030230000000000000000000000000000000000000000000000000114519032411000000000000034419030811032311032711035119000000000000000000000000000000000000000000000000110638
Respuesta: 0r00
```

Más muestras del documento original:

```
!0T01A56401517070000000000001944210000000000000000000000000000000303150318150000002332261936151950151914300000000000000334300000000000000000000301030302260700000007
!0R01A110234030211031711113219033611030230000000000000000000000000000000000000000000000000114519032411000000000000034419030811032311032711035119000000000000000000000000000000000000000000000000110638
!0T02A56300312030000000000001928250000000000000000000000000000000300110313110000003125211927110000001912250000000000000000000000000000000000000000000300210600000007
```

(Ver la pantalla de diseño de etiquetas en **JT-Scale Tool**; las imágenes del documento
original no están disponibles en la extracción.)

---

## VII. Información de PLU

Muestras:

```
!0V0001A2281080002000000000000803000000000000000000000000000000000000000000000000B186642525027C186642525028D186642525028E
!0V0002A2280081001050000000008020000000000000000000100100000000000000000000000000B186642522294CDE
!0V0003A2290082001000001020310030000000000000000000000300000610071240131820192330B186642524093C037503750375D037603760376E
Respuesta: 0v0001a2   (el número después de la 'a' es el primer dígito del código de producto)
```

Desglose del primer ejemplo:

| Valor | Campo |
|---|---|
| `!0V` | Encabezado de protocolo (fijo) |
| `0001` | Número de PLU (4 dígitos) |
| `A` | Separador |
| `2281080` | Código de producto (7 dígitos) |
| `002000` | Precio unitario (6 dígitos), en centavos/kg [equivale a 20 yuan/kg] — ver nota |
| `0` | Modo de pesaje (1 dígito): 0 = por peso · 1 = por pieza · 2 = peso fijo |
| `00` | Información especial 1 (2 dígitos) |
| `00` | Información especial 2 (2 dígitos) |
| `00` | Información especial 3 (2 dígitos) |
| `008` | Vida útil (3 dígitos) |
| `03` | Tienda (2 dígitos) |
| `00` | Departamento (2 dígitos) |
| `0000000000000` | 13 ceros (reservado) |
| `01000` | Peso específico / peso unitario (5 dígitos), en gramos [equivale a 1 kg] |
| `00` | Número de etiqueta (2 dígitos) [invoca la etiqueta N.º 0] |
| `02` | Flag de descuento (2 dígitos): 00 = el precio no se ajusta por franja horaria ni manualmente · 01 = ajuste automático por franja, sin ajuste manual · 02 = ajuste automático por franja, con ajuste manual |
| `01` / `06` / `10` | Inicio, fin y descuento de la 1.ª franja horaria (2 dígitos c/u) |
| `07` / `12` / `20` | Inicio, fin y descuento de la 2.ª franja |
| `13` / `18` / `30` | Inicio, fin y descuento de la 3.ª franja |
| `19` / `24` / `40` | Inicio, fin y descuento de la 4.ª franja |
| `B` | Separador |
| `186642525027` | Código de posición del **nombre del producto** |
| `C` | Separador |
| `186642525028` | Código de posición de la **nota A** |
| `D` | Separador |
| `186642525029` | Código de posición de la **nota B** |
| `E` | Separador final |

**Nota (del original):** la función de descuento por franja horaria fue **eliminada**;
los 24 dígitos correspondientes deben enviarse igualmente (como ceros).

> **[N. del T.]** Sobre el precio "en centavos": aplica al mercado chino (fen/yuan). En
> instalaciones con moneda sin decimales (p. ej. pesos chilenos) el campo es el **entero
> de moneda tal cual**, sin dividir por 100. Validar contra un ticket impreso de la propia
> instalación. Los códigos de posición tras `B`/`C`/`D` usan la codificación descrita en
> la sección III.

---

## VIII. Protocolo de recolección de reportes (ventas)

```
!0J0001A
```

`!0J` = encabezado de recolección · `0001` = número de registro a recuperar ·
`A` = separador · terminar con Enter (CR LF).

**Nota:** si la balanza no tiene datos en ese registro, devuelve `0j0001ac`.

Valor devuelto (ejemplo del original):

```
0j0001a090327160900030001000780020000000160000016000000200000401bc
```

Desglose:

| Valor | Campo |
|---|---|
| `0j` | Encabezado de protocolo |
| `0001` | Número de registro |
| `a` | Separador |
| `0903271609` | Fecha/hora: 27/03/2009 16:09 |
| | **Explicación del mes:** modo de pesaje = mes ÷ 16 (cociente 0 = por peso; 1 = por pieza); mes real = mes % 16 (resto) |
| `00` | Departamento |
| `03` | Número de tienda |
| `0001` | Número de PLU |
| `00780` | Peso |
| `002000` | Precio unitario |
| `0001600` | Precio total antes de descuento |
| `0001600` | Precio total después de descuento |
| `00002000004` | *(sin explicación en el original — ver nota)* |
| `01` | Número de balanza |
| `bc` | Carácter de cierre |

> **[N. del T.]** El campo de 11 dígitos que el original deja sin documentar es el
> **contador de ticket × 256** (`ticket = campo ÷ 256`). Todas las líneas de una venta
> multi-artículo comparten el valor y son registros contiguos. El contador se reinicia y
> repite entre ciclos: la clave única de una venta es (número de registro, fecha), nunca
> el ticket solo. Además: el peso viene en gramos (unidades en modo pieza), los totales
> los **trunca** la balanza (no recalcular peso × precio) y los montos siguen la misma
> regla de moneda de la sección VII. Detalle completo en `docs/SDK-integracion.md` §4.

---

## IX. Descarga del reloj

```
!0P1103230859    Respuesta: 0p
```

`!0P` = encabezado de protocolo. Los dígitos `1103230859` siguen el formato
**YYMMDDhhmm** (año, mes, día, hora, minuto).

> **[N. del T.]** El protocolo solo permite **fijar** el reloj; no existe comando para
> leerlo. Se ha observado deriva (~1 día): conviene sincronizarlo periódicamente.
