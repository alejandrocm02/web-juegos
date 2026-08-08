import { shuffleWithRng } from '../util.js';

export const QUIZ_CATEGORIES = [
  'cultura general',
  'ciencia',
  'historia',
  'geografia',
  'cine',
  'musica',
  'tecnologia',
] as const;

export type QuizCategory = (typeof QUIZ_CATEGORIES)[number];

export interface QuizQuestion {
  id: string;
  category: QuizCategory;
  text: string;
  answers: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}

/** Pregunta tal y como se envía al cliente: nunca incluye la respuesta correcta. */
export interface PublicQuizQuestion {
  id: string;
  category: QuizCategory;
  text: string;
  answers: [string, string, string, string];
  index: number;
  total: number;
}

export interface QuizAnswerBreakdown {
  playerId: string;
  answerIndex: number | null;
  correct: boolean;
  gained: number;
  timeMs: number | null;
}

export const QUIZ_BASE_POINTS = 100;
export const QUIZ_SPEED_BONUS = 50;

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'cg-01',
    category: 'cultura general',
    text: '¿Cuántos lados tiene un heptágono?',
    answers: ['Seis', 'Siete', 'Ocho', 'Nueve'],
    correctIndex: 1,
  },
  {
    id: 'cg-02',
    category: 'cultura general',
    text: '¿Qué instrumento mide la presión atmosférica?',
    answers: ['Higrómetro', 'Barómetro', 'Anemómetro', 'Pluviómetro'],
    correctIndex: 1,
  },
  {
    id: 'cg-03',
    category: 'cultura general',
    text: '¿De qué color es la caja negra de un avión?',
    answers: ['Negra', 'Gris', 'Naranja', 'Azul'],
    correctIndex: 2,
  },
  {
    id: 'cg-04',
    category: 'cultura general',
    text: '¿Cuántas cuerdas tiene un violín?',
    answers: ['Cuatro', 'Cinco', 'Seis', 'Siete'],
    correctIndex: 0,
  },
  {
    id: 'cg-05',
    category: 'cultura general',
    text: '¿Qué idioma tiene más hablantes nativos en el mundo?',
    answers: ['Inglés', 'Español', 'Hindi', 'Chino mandarín'],
    correctIndex: 3,
  },
  {
    id: 'cg-06',
    category: 'cultura general',
    text: '¿Cuál es el metal líquido a temperatura ambiente?',
    answers: ['Mercurio', 'Plomo', 'Estaño', 'Zinc'],
    correctIndex: 0,
  },
  {
    id: 'ci-01',
    category: 'ciencia',
    text: '¿Cuál es el símbolo químico del potasio?',
    answers: ['P', 'Po', 'K', 'Pt'],
    correctIndex: 2,
  },
  {
    id: 'ci-02',
    category: 'ciencia',
    text: '¿Qué planeta tiene el sistema de anillos más visible?',
    answers: ['Júpiter', 'Saturno', 'Urano', 'Neptuno'],
    correctIndex: 1,
  },
  {
    id: 'ci-03',
    category: 'ciencia',
    text: '¿Cuál es el órgano más grande del cuerpo humano?',
    answers: ['El hígado', 'El intestino', 'La piel', 'El pulmón'],
    correctIndex: 2,
  },
  {
    id: 'ci-04',
    category: 'ciencia',
    text: '¿Qué gas absorben las plantas para la fotosíntesis?',
    answers: ['Oxígeno', 'Dióxido de carbono', 'Nitrógeno', 'Metano'],
    correctIndex: 1,
  },
  {
    id: 'ci-05',
    category: 'ciencia',
    text: '¿A qué velocidad aproximada viaja la luz en el vacío?',
    answers: ['300.000 km/s', '30.000 km/s', '3.000 km/s', '3.000.000 km/s'],
    correctIndex: 0,
  },
  {
    id: 'ci-06',
    category: 'ciencia',
    text: '¿Cuántos huesos tiene aproximadamente un adulto humano?',
    answers: ['186', '206', '226', '246'],
    correctIndex: 1,
  },
  {
    id: 'ci-07',
    category: 'ciencia',
    text: '¿Qué partícula subatómica tiene carga negativa?',
    answers: ['Protón', 'Neutrón', 'Electrón', 'Positrón'],
    correctIndex: 2,
  },
  {
    id: 'hi-01',
    category: 'historia',
    text: '¿En qué año cayó el Muro de Berlín?',
    answers: ['1987', '1989', '1991', '1993'],
    correctIndex: 1,
  },
  {
    id: 'hi-02',
    category: 'historia',
    text: '¿Quién fue el primer emperador romano?',
    answers: ['Julio César', 'Augusto', 'Nerón', 'Trajano'],
    correctIndex: 1,
  },
  {
    id: 'hi-03',
    category: 'historia',
    text: '¿En qué año llegó el ser humano a la Luna por primera vez?',
    answers: ['1965', '1969', '1972', '1975'],
    correctIndex: 1,
  },
  {
    id: 'hi-04',
    category: 'historia',
    text: '¿Qué civilización construyó Machu Picchu?',
    answers: ['Azteca', 'Maya', 'Inca', 'Olmeca'],
    correctIndex: 2,
  },
  {
    id: 'hi-05',
    category: 'historia',
    text: '¿En qué siglo se inventó la imprenta de tipos móviles en Europa?',
    answers: ['Siglo XIII', 'Siglo XV', 'Siglo XVII', 'Siglo XVIII'],
    correctIndex: 1,
  },
  {
    id: 'hi-06',
    category: 'historia',
    text: '¿Cómo se llamaba el barco en el que Darwin dio la vuelta al mundo?',
    answers: ['Beagle', 'Endeavour', 'Victoria', 'Discovery'],
    correctIndex: 0,
  },
  {
    id: 'ge-01',
    category: 'geografia',
    text: '¿Cuál es el río más largo de África?',
    answers: ['Congo', 'Nilo', 'Níger', 'Zambeze'],
    correctIndex: 1,
  },
  {
    id: 'ge-02',
    category: 'geografia',
    text: '¿Cuál es la capital de Australia?',
    answers: ['Sidney', 'Melbourne', 'Canberra', 'Perth'],
    correctIndex: 2,
  },
  {
    id: 'ge-03',
    category: 'geografia',
    text: '¿En qué continente está el desierto de Atacama?',
    answers: ['África', 'Asia', 'América del Sur', 'Oceanía'],
    correctIndex: 2,
  },
  {
    id: 'ge-04',
    category: 'geografia',
    text: '¿Cuál es el país más extenso del mundo?',
    answers: ['Canadá', 'China', 'Estados Unidos', 'Rusia'],
    correctIndex: 3,
  },
  {
    id: 'ge-05',
    category: 'geografia',
    text: '¿Qué mar separa Europa de África por el sur?',
    answers: ['Mar Negro', 'Mar Mediterráneo', 'Mar Caspio', 'Mar Rojo'],
    correctIndex: 1,
  },
  {
    id: 'ge-06',
    category: 'geografia',
    text: '¿Cuál es la montaña más alta de América?',
    answers: ['Aconcagua', 'Denali', 'Chimborazo', 'Huascarán'],
    correctIndex: 0,
  },
  {
    id: 'ge-07',
    category: 'geografia',
    text: '¿Cuántas comunidades autónomas tiene España?',
    answers: ['15', '16', '17', '19'],
    correctIndex: 2,
  },
  {
    id: 'cn-01',
    category: 'cine',
    text: '¿Quién dirigió la película Jurassic Park de 1993?',
    answers: ['James Cameron', 'Steven Spielberg', 'Ridley Scott', 'George Lucas'],
    correctIndex: 1,
  },
  {
    id: 'cn-02',
    category: 'cine',
    text: '¿En qué película aparece el personaje Forrest Gump?',
    answers: ['Big Fish', 'Forrest Gump', 'Rain Man', 'Cast Away'],
    correctIndex: 1,
  },
  {
    id: 'cn-03',
    category: 'cine',
    text: '¿Qué estudio produjo la película Toy Story?',
    answers: ['Pixar', 'DreamWorks', 'Blue Sky', 'Illumination'],
    correctIndex: 0,
  },
  {
    id: 'cn-04',
    category: 'cine',
    text: '¿Cuál de estas películas es de ciencia ficción?',
    answers: ['Blade Runner', 'Casablanca', 'Rocky', 'El Padrino'],
    correctIndex: 0,
  },
  {
    id: 'cn-05',
    category: 'cine',
    text: '¿Quién interpreta a Neo en Matrix?',
    answers: ['Brad Pitt', 'Keanu Reeves', 'Tom Cruise', 'Will Smith'],
    correctIndex: 1,
  },
  {
    id: 'cn-06',
    category: 'cine',
    text: '¿De qué país es originario el estudio de animación Ghibli?',
    answers: ['Corea del Sur', 'China', 'Japón', 'Francia'],
    correctIndex: 2,
  },
  {
    id: 'mu-01',
    category: 'musica',
    text: '¿Cuántas teclas tiene un piano estándar?',
    answers: ['76', '82', '88', '92'],
    correctIndex: 2,
  },
  {
    id: 'mu-02',
    category: 'musica',
    text: '¿De qué ciudad eran originarios los Beatles?',
    answers: ['Londres', 'Liverpool', 'Manchester', 'Dublín'],
    correctIndex: 1,
  },
  {
    id: 'mu-03',
    category: 'musica',
    text: '¿Qué compositor escribió Las cuatro estaciones?',
    answers: ['Bach', 'Mozart', 'Vivaldi', 'Beethoven'],
    correctIndex: 2,
  },
  {
    id: 'mu-04',
    category: 'musica',
    text: '¿Cuántas cuerdas tiene una guitarra española clásica?',
    answers: ['Cuatro', 'Cinco', 'Seis', 'Doce'],
    correctIndex: 2,
  },
  {
    id: 'mu-05',
    category: 'musica',
    text: '¿Qué género musical nació en Jamaica?',
    answers: ['Reggae', 'Tango', 'Flamenco', 'Blues'],
    correctIndex: 0,
  },
  {
    id: 'mu-06',
    category: 'musica',
    text: '¿Qué instrumento toca principalmente un percusionista de batería?',
    answers: ['Cuerdas', 'Viento madera', 'Percusión', 'Viento metal'],
    correctIndex: 2,
  },
  {
    id: 'te-01',
    category: 'tecnologia',
    text: '¿Qué significa HTML?',
    answers: [
      'HyperText Markup Language',
      'HighText Machine Language',
      'Hyper Transfer Markup Logic',
      'Home Tool Markup Language',
    ],
    correctIndex: 0,
  },
  {
    id: 'te-02',
    category: 'tecnologia',
    text: '¿Cuántos bits tiene un byte?',
    answers: ['4', '8', '16', '32'],
    correctIndex: 1,
  },
  {
    id: 'te-03',
    category: 'tecnologia',
    text: '¿Quién creó el lenguaje de programación Python?',
    answers: ['Guido van Rossum', 'James Gosling', 'Bjarne Stroustrup', 'Dennis Ritchie'],
    correctIndex: 0,
  },
  {
    id: 'te-04',
    category: 'tecnologia',
    text: '¿Qué protocolo se usa para enviar correo electrónico?',
    answers: ['FTP', 'SMTP', 'SSH', 'DNS'],
    correctIndex: 1,
  },
  {
    id: 'te-05',
    category: 'tecnologia',
    text: '¿Qué empresa desarrolló el sistema operativo Android?',
    answers: ['Apple', 'Microsoft', 'Google', 'Nokia'],
    correctIndex: 2,
  },
  {
    id: 'te-06',
    category: 'tecnologia',
    text: '¿Qué significa la sigla CPU?',
    answers: [
      'Central Processing Unit',
      'Computer Personal Unit',
      'Central Program Utility',
      'Control Process Unit',
    ],
    correctIndex: 0,
  },
  {
    id: 'te-07',
    category: 'tecnologia',
    text: 'En una dirección web, ¿qué indica el prefijo HTTPS?',
    answers: [
      'Que la conexión está cifrada',
      'Que la página es gratuita',
      'Que la página es antigua',
      'Que la página usa cookies',
    ],
    correctIndex: 0,
  },
  {
    id: 'cg-07',
    category: 'cultura general',
    text: '¿Cuántos minutos dura un partido de fútbol reglamentario sin prórroga?',
    answers: ['80', '90', '100', '120'],
    correctIndex: 1,
  },

  /* --------------------------- Cultura general --------------------------- */

  {
    id: 'cg-08',
    category: 'cultura general',
    text: '¿Cuántas piezas tiene cada jugador al empezar una partida de ajedrez?',
    answers: ['12', '14', '16', '18'],
    correctIndex: 2,
  },
  {
    id: 'cg-09',
    category: 'cultura general',
    text: '¿Qué figura geométrica tiene todos sus puntos a la misma distancia del centro?',
    answers: ['El cuadrado', 'El círculo', 'El rombo', 'El trapecio'],
    correctIndex: 1,
  },
  {
    id: 'cg-10',
    category: 'cultura general',
    text: '¿Cuál es el idioma con más hablantes nativos del mundo?',
    answers: ['Inglés', 'Español', 'Chino mandarín', 'Hindi'],
    correctIndex: 2,
  },
  {
    id: 'cg-11',
    category: 'cultura general',
    text: 'En el sistema métrico, ¿cuántos gramos tiene un kilogramo?',
    answers: ['100', '500', '1.000', '10.000'],
    correctIndex: 2,
  },
  {
    id: 'cg-12',
    category: 'cultura general',
    text: '¿Cuántos colores tiene el arcoíris tal y como se describe tradicionalmente?',
    answers: ['Cinco', 'Seis', 'Siete', 'Ocho'],
    correctIndex: 2,
  },
  {
    id: 'cg-13',
    category: 'cultura general',
    text: '¿Qué animal es el símbolo del Fondo Mundial para la Naturaleza (WWF)?',
    answers: ['El tigre', 'El panda gigante', 'El elefante', 'El delfín'],
    correctIndex: 1,
  },
  {
    id: 'cg-14',
    category: 'cultura general',
    text: '¿Cuántas cartas tiene una baraja francesa completa sin comodines?',
    answers: ['48', '50', '52', '54'],
    correctIndex: 2,
  },
  {
    id: 'cg-15',
    category: 'cultura general',
    text: '¿Qué se mide con la escala de Richter?',
    answers: [
      'La intensidad del viento',
      'La magnitud de los terremotos',
      'La acidez del agua',
      'La altura de las olas',
    ],
    correctIndex: 1,
  },
  {
    id: 'cg-16',
    category: 'cultura general',
    text: '¿Cuántos jugadores hay en un equipo de baloncesto sobre la pista?',
    answers: ['Cuatro', 'Cinco', 'Seis', 'Siete'],
    correctIndex: 1,
  },
  {
    id: 'cg-17',
    category: 'cultura general',
    text: '¿Qué autor escribió "Don Quijote de la Mancha"?',
    answers: [
      'Lope de Vega',
      'Miguel de Cervantes',
      'Francisco de Quevedo',
      'Garcilaso de la Vega',
    ],
    correctIndex: 1,
  },
  {
    id: 'cg-18',
    category: 'cultura general',
    text: 'En un teclado de piano, ¿de qué color son las teclas de los semitonos?',
    answers: ['Blancas', 'Negras', 'Grises', 'Rojas'],
    correctIndex: 1,
  },
  {
    id: 'cg-19',
    category: 'cultura general',
    text: '¿Cuántos lados tiene un dodecágono?',
    answers: ['Diez', 'Once', 'Doce', 'Veinte'],
    correctIndex: 2,
  },
  {
    id: 'cg-20',
    category: 'cultura general',
    text: '¿Qué instrumento se usa para orientarse señalando el norte magnético?',
    answers: ['El sextante', 'La brújula', 'El astrolabio', 'El altímetro'],
    correctIndex: 1,
  },
  {
    id: 'cg-21',
    category: 'cultura general',
    text: '¿Cuántos anillos tiene el símbolo olímpico?',
    answers: ['Cuatro', 'Cinco', 'Seis', 'Siete'],
    correctIndex: 1,
  },
  {
    id: 'cg-22',
    category: 'cultura general',
    text: '¿Qué bebida se obtiene de la fermentación de la uva?',
    answers: ['La cerveza', 'El vino', 'La sidra', 'El ron'],
    correctIndex: 1,
  },

  /* ------------------------------- Ciencia ------------------------------- */

  {
    id: 'ci-08',
    category: 'ciencia',
    text: '¿Cuál es el símbolo químico del oro?',
    answers: ['Or', 'Au', 'Ag', 'Go'],
    correctIndex: 1,
  },
  {
    id: 'ci-09',
    category: 'ciencia',
    text: '¿Cuántos huesos tiene aproximadamente el cuerpo humano adulto?',
    answers: ['106', '186', '206', '306'],
    correctIndex: 2,
  },
  {
    id: 'ci-10',
    category: 'ciencia',
    text: '¿Qué gas absorben las plantas para realizar la fotosíntesis?',
    answers: ['Oxígeno', 'Nitrógeno', 'Dióxido de carbono', 'Hidrógeno'],
    correctIndex: 2,
  },
  {
    id: 'ci-11',
    category: 'ciencia',
    text: '¿Cuál es el planeta más grande del sistema solar?',
    answers: ['Saturno', 'Júpiter', 'Neptuno', 'Urano'],
    correctIndex: 1,
  },
  {
    id: 'ci-12',
    category: 'ciencia',
    text: '¿A qué temperatura hierve el agua a nivel del mar?',
    answers: ['90 °C', '95 °C', '100 °C', '110 °C'],
    correctIndex: 2,
  },
  {
    id: 'ci-13',
    category: 'ciencia',
    text: '¿Qué órgano del cuerpo humano produce la insulina?',
    answers: ['El hígado', 'El páncreas', 'El bazo', 'El riñón'],
    correctIndex: 1,
  },
  {
    id: 'ci-14',
    category: 'ciencia',
    text: '¿Cuál es la partícula del átomo con carga negativa?',
    answers: ['El protón', 'El neutrón', 'El electrón', 'El fotón'],
    correctIndex: 2,
  },
  {
    id: 'ci-15',
    category: 'ciencia',
    text: '¿Qué científica recibió dos premios Nobel en disciplinas distintas?',
    answers: ['Marie Curie', 'Rosalind Franklin', 'Ada Lovelace', 'Lise Meitner'],
    correctIndex: 0,
  },
  {
    id: 'ci-16',
    category: 'ciencia',
    text: '¿Qué tipo de sangre se considera donante universal?',
    answers: ['A positivo', 'AB positivo', 'O negativo', 'B negativo'],
    correctIndex: 2,
  },
  {
    id: 'ci-17',
    category: 'ciencia',
    text: '¿Qué capa de la atmósfera nos protege de la radiación ultravioleta?',
    answers: ['La troposfera', 'La capa de ozono', 'La ionosfera', 'La exosfera'],
    correctIndex: 1,
  },
  {
    id: 'ci-18',
    category: 'ciencia',
    text: '¿Qué fuerza mantiene a los planetas en órbita alrededor del Sol?',
    answers: ['La gravedad', 'El magnetismo', 'La fuerza nuclear', 'La electricidad'],
    correctIndex: 0,
  },
  {
    id: 'ci-19',
    category: 'ciencia',
    text: '¿Cuántas cámaras tiene el corazón humano?',
    answers: ['Dos', 'Tres', 'Cuatro', 'Cinco'],
    correctIndex: 2,
  },
  {
    id: 'ci-20',
    category: 'ciencia',
    text: '¿Qué molécula almacena la información genética de los seres vivos?',
    answers: ['La proteína', 'El ADN', 'La glucosa', 'El colágeno'],
    correctIndex: 1,
  },
  {
    id: 'ci-21',
    category: 'ciencia',
    text: '¿Cuál es la unidad básica de la vida?',
    answers: ['El tejido', 'La célula', 'El órgano', 'La molécula'],
    correctIndex: 1,
  },
  {
    id: 'ci-22',
    category: 'ciencia',
    text: '¿Qué proceso convierte un líquido en gas por calentamiento?',
    answers: ['Condensación', 'Sublimación', 'Evaporación', 'Solidificación'],
    correctIndex: 2,
  },

  /* ------------------------------- Historia ------------------------------ */

  {
    id: 'hi-07',
    category: 'historia',
    text: '¿Qué nombre recibió el programa espacial estadounidense que llevó astronautas a la Luna?',
    answers: ['Programa Mercury', 'Programa Apolo', 'Programa Gemini', 'Programa Skylab'],
    correctIndex: 1,
  },
  {
    id: 'hi-08',
    category: 'historia',
    text: '¿En qué país actual se encuentran las ruinas de Machu Picchu?',
    answers: ['Bolivia', 'Perú', 'Ecuador', 'Colombia'],
    correctIndex: 1,
  },
  {
    id: 'hi-09',
    category: 'historia',
    text: '¿Qué muralla defensiva se construyó a lo largo de siglos en el norte de China?',
    answers: [
      'El Muro de Adriano',
      'La Gran Muralla',
      'Las murallas de Constantinopla',
      'La Línea Maginot',
    ],
    correctIndex: 1,
  },
  {
    id: 'hi-10',
    category: 'historia',
    text: '¿Qué imperio construyó el Coliseo de Roma?',
    answers: ['El griego', 'El romano', 'El persa', 'El otomano'],
    correctIndex: 1,
  },
  {
    id: 'hi-11',
    category: 'historia',
    text: '¿Cómo se llamaba la escritura de los antiguos egipcios?',
    answers: ['Cuneiforme', 'Jeroglífica', 'Rúnica', 'Cirílica'],
    correctIndex: 1,
  },
  {
    id: 'hi-12',
    category: 'historia',
    text: '¿Qué acontecimiento marca tradicionalmente el final de la Edad Media?',
    answers: [
      'La caída del Imperio romano',
      'La toma de Constantinopla en 1453',
      'La Revolución Francesa',
      'La Primera Guerra Mundial',
    ],
    correctIndex: 1,
  },
  {
    id: 'hi-13',
    category: 'historia',
    text: '¿En qué siglo tuvo lugar la Revolución Francesa?',
    answers: ['Siglo XVI', 'Siglo XVII', 'Siglo XVIII', 'Siglo XIX'],
    correctIndex: 2,
  },
  {
    id: 'hi-14',
    category: 'historia',
    text: '¿Qué material da nombre a la Edad de Bronce?',
    answers: [
      'Una aleación de cobre y estaño',
      'El hierro forjado',
      'La piedra pulida',
      'El oro batido',
    ],
    correctIndex: 0,
  },
  {
    id: 'hi-15',
    category: 'historia',
    text: '¿Qué invento de Gutenberg transformó la difusión del conocimiento?',
    answers: ['El papel', 'La imprenta de tipos móviles', 'La brújula', 'El telescopio'],
    correctIndex: 1,
  },
  {
    id: 'hi-16',
    category: 'historia',
    text: '¿En qué año empezó la Primera Guerra Mundial?',
    answers: ['1912', '1914', '1916', '1918'],
    correctIndex: 1,
  },
  {
    id: 'hi-17',
    category: 'historia',
    text: '¿Qué faraón egipcio se hizo famoso por el descubrimiento de su tumba intacta en 1922?',
    answers: ['Ramsés II', 'Tutankamón', 'Keops', 'Akenatón'],
    correctIndex: 1,
  },
  {
    id: 'hi-18',
    category: 'historia',
    text: '¿Qué ruta comercial conectaba Asia con Europa en la Antigüedad?',
    answers: ['La Ruta de la Seda', 'La Ruta del Ámbar', 'El Camino Real', 'La Vía Apia'],
    correctIndex: 0,
  },
  {
    id: 'hi-19',
    category: 'historia',
    text: '¿Qué documento firmado en 1215 limitó el poder del rey de Inglaterra?',
    answers: ['La Carta Magna', 'El Edicto de Nantes', 'La Paz de Westfalia', 'El Acta de Unión'],
    correctIndex: 0,
  },
  {
    id: 'hi-20',
    category: 'historia',
    text: '¿En qué ciudad se firmó el tratado que puso fin a la Primera Guerra Mundial?',
    answers: ['Viena', 'Versalles', 'Ginebra', 'Praga'],
    correctIndex: 1,
  },
  {
    id: 'hi-21',
    category: 'historia',
    text: '¿Qué expedición completó la primera vuelta al mundo en el siglo XVI?',
    answers: [
      'La de Colón',
      'La de Magallanes y Elcano',
      'La de Vasco de Gama',
      'La de Marco Polo',
    ],
    correctIndex: 1,
  },

  /* ------------------------------ Geografía ------------------------------ */

  {
    id: 'ge-08',
    category: 'geografia',
    text: '¿Cuál es el océano más grande del planeta?',
    answers: ['Atlántico', 'Índico', 'Pacífico', 'Ártico'],
    correctIndex: 2,
  },
  {
    id: 'ge-09',
    category: 'geografia',
    text: '¿Cuál es el desierto cálido más extenso del mundo?',
    answers: ['Gobi', 'Sáhara', 'Kalahari', 'Atacama'],
    correctIndex: 1,
  },
  {
    id: 'ge-10',
    category: 'geografia',
    text: '¿En qué continente se encuentra el río Amazonas?',
    answers: ['África', 'Asia', 'América del Sur', 'Oceanía'],
    correctIndex: 2,
  },
  {
    id: 'ge-11',
    category: 'geografia',
    text: '¿Qué gran arrecife de coral se encuentra frente a la costa nororiental de Australia?',
    answers: [
      'El arrecife de Belice',
      'La Gran Barrera de Coral',
      'El atolón de Aldabra',
      'El arrecife de Tubbataha',
    ],
    correctIndex: 1,
  },
  {
    id: 'ge-12',
    category: 'geografia',
    text: '¿Qué cordillera separa tradicionalmente Europa de Asia?',
    answers: ['Los Alpes', 'Los Urales', 'El Cáucaso', 'Los Cárpatos'],
    correctIndex: 1,
  },
  {
    id: 'ge-13',
    category: 'geografia',
    text: '¿Cuál es el río más largo de Europa?',
    answers: ['El Danubio', 'El Volga', 'El Rin', 'El Sena'],
    correctIndex: 1,
  },
  {
    id: 'ge-14',
    category: 'geografia',
    text: '¿En qué país se encuentra la ciudad de Marrakech?',
    answers: ['Argelia', 'Túnez', 'Marruecos', 'Egipto'],
    correctIndex: 2,
  },
  {
    id: 'ge-15',
    category: 'geografia',
    text: '¿Cuál es el lago más profundo del mundo?',
    answers: ['El lago Superior', 'El lago Baikal', 'El lago Victoria', 'El lago Titicaca'],
    correctIndex: 1,
  },
  {
    id: 'ge-16',
    category: 'geografia',
    text: '¿Qué estrecho separa Europa de África en su punto más cercano?',
    answers: ['El de Ormuz', 'El de Gibraltar', 'El de Bering', 'El de Magallanes'],
    correctIndex: 1,
  },
  {
    id: 'ge-17',
    category: 'geografia',
    text: '¿Cuál es el único continente sin población permanente?',
    answers: ['Oceanía', 'La Antártida', 'Groenlandia', 'Asia central'],
    correctIndex: 1,
  },
  {
    id: 'ge-18',
    category: 'geografia',
    text: '¿Qué archipiélago español está en el océano Atlántico?',
    answers: ['Las Baleares', 'Las Canarias', 'Las Cíes', 'Las Columbretes'],
    correctIndex: 1,
  },
  {
    id: 'ge-19',
    category: 'geografia',
    text: '¿Cuál es la capital de Canadá?',
    answers: ['Toronto', 'Vancouver', 'Ottawa', 'Montreal'],
    correctIndex: 2,
  },
  {
    id: 'ge-20',
    category: 'geografia',
    text: '¿Qué línea imaginaria divide la Tierra en hemisferio norte y sur?',
    answers: [
      'El meridiano de Greenwich',
      'El ecuador',
      'El trópico de Cáncer',
      'El círculo polar',
    ],
    correctIndex: 1,
  },
  {
    id: 'ge-21',
    category: 'geografia',
    text: '¿En qué país se encuentran las cataratas del Niágara además de en Estados Unidos?',
    answers: ['México', 'Canadá', 'Groenlandia', 'Cuba'],
    correctIndex: 1,
  },
  {
    id: 'ge-22',
    category: 'geografia',
    text: '¿Cuál es el mar más salado del planeta entre los grandes lagos salados?',
    answers: ['El mar Rojo', 'El mar Muerto', 'El mar Caspio', 'El mar Negro'],
    correctIndex: 1,
  },

  /* -------------------------------- Cine --------------------------------- */

  {
    id: 'cn-07',
    category: 'cine',
    text: '¿Qué estudio de animación creó "Toy Story"?',
    answers: ['DreamWorks', 'Pixar', 'Illumination', 'Blue Sky'],
    correctIndex: 1,
  },
  {
    id: 'cn-08',
    category: 'cine',
    text: '¿Cómo se llama el premio principal del Festival de Cannes?',
    answers: ['El Oso de Oro', 'La Palma de Oro', 'El León de Oro', 'La Concha de Oro'],
    correctIndex: 1,
  },
  {
    id: 'cn-09',
    category: 'cine',
    text: '¿Qué director es conocido como "el maestro del suspense"?',
    answers: ['Stanley Kubrick', 'Alfred Hitchcock', 'Orson Welles', 'Billy Wilder'],
    correctIndex: 1,
  },
  {
    id: 'cn-10',
    category: 'cine',
    text: 'En "El mago de Oz", ¿qué buscaba el Espantapájaros?',
    answers: ['Un corazón', 'Un cerebro', 'Valor', 'Volver a casa'],
    correctIndex: 1,
  },
  {
    id: 'cn-11',
    category: 'cine',
    text: '¿Qué nombre recibe la estatuilla de los premios de la Academia de Hollywood?',
    answers: ['Globo', 'Óscar', 'Emmy', 'Bafta'],
    correctIndex: 1,
  },
  {
    id: 'cn-12',
    category: 'cine',
    text: '¿En qué película aparece la frase "Que la fuerza te acompañe"?',
    answers: ['Star Trek', 'Star Wars', 'Dune', 'Battlestar Galactica'],
    correctIndex: 1,
  },
  {
    id: 'cn-13',
    category: 'cine',
    text: '¿Qué animal protagoniza la película "El rey león"?',
    answers: ['El tigre', 'El león', 'El leopardo', 'La pantera'],
    correctIndex: 1,
  },
  {
    id: 'cn-14',
    category: 'cine',
    text: '¿Cómo se llama el género de películas del Oeste americano?',
    answers: ['Thriller', 'Western', 'Noir', 'Peplum'],
    correctIndex: 1,
  },
  {
    id: 'cn-15',
    category: 'cine',
    text: '¿Qué famoso barco se hunde en la película de James Cameron de 1997?',
    answers: ['El Lusitania', 'El Titanic', 'El Britannic', 'El Poseidón'],
    correctIndex: 1,
  },
  {
    id: 'cn-16',
    category: 'cine',
    text: '¿Qué director español ganó el Óscar a mejor película de habla no inglesa por "Todo sobre mi madre"?',
    answers: ['Alejandro Amenábar', 'Pedro Almodóvar', 'Carlos Saura', 'Luis Buñuel'],
    correctIndex: 1,
  },
  {
    id: 'cn-17',
    category: 'cine',
    text: '¿Cómo se llama el efecto de rodar una escena a cámara muy lenta?',
    answers: ['Time-lapse', 'Slow motion', 'Zoom óptico', 'Fundido'],
    correctIndex: 1,
  },
  {
    id: 'cn-18',
    category: 'cine',
    text: 'En la trilogía "El señor de los anillos", ¿qué hay que destruir?',
    answers: ['Una espada', 'Un anillo', 'Una corona', 'Un cetro'],
    correctIndex: 1,
  },
  {
    id: 'cn-19',
    category: 'cine',
    text: '¿Qué personaje de dibujos animados es un ratón creado por Walt Disney en 1928?',
    answers: ['Bugs Bunny', 'Mickey Mouse', 'Tom', 'Jerry'],
    correctIndex: 1,
  },
  {
    id: 'cn-20',
    category: 'cine',
    text: '¿Cómo se llama la persona que escribe el guion de una película?',
    answers: ['Productor', 'Guionista', 'Montador', 'Director de fotografía'],
    correctIndex: 1,
  },
  {
    id: 'cn-21',
    category: 'cine',
    text: '¿Qué película de ciencia ficción de 1999 popularizó el efecto "bullet time"?',
    answers: ['Blade Runner', 'Matrix', 'Alien', 'Terminator'],
    correctIndex: 1,
  },

  /* -------------------------------- Música ------------------------------- */

  {
    id: 'mu-07',
    category: 'musica',
    text: '¿Cuántas cuerdas tiene una guitarra española estándar?',
    answers: ['Cuatro', 'Cinco', 'Seis', 'Siete'],
    correctIndex: 2,
  },
  {
    id: 'mu-08',
    category: 'musica',
    text: '¿Qué compositor alemán escribió la "Novena sinfonía" siendo ya sordo?',
    answers: ['Mozart', 'Beethoven', 'Bach', 'Brahms'],
    correctIndex: 1,
  },
  {
    id: 'mu-09',
    category: 'musica',
    text: '¿De qué país es originario el flamenco?',
    answers: ['Portugal', 'España', 'Italia', 'Grecia'],
    correctIndex: 1,
  },
  {
    id: 'mu-10',
    category: 'musica',
    text: '¿Cuántas notas tiene la escala musical básica occidental?',
    answers: ['Cinco', 'Seis', 'Siete', 'Ocho'],
    correctIndex: 2,
  },
  {
    id: 'mu-11',
    category: 'musica',
    text: '¿Qué instrumento de viento tiene lengüeta doble y forma cónica?',
    answers: ['La flauta travesera', 'El oboe', 'La trompeta', 'El trombón'],
    correctIndex: 1,
  },
  {
    id: 'mu-12',
    category: 'musica',
    text: '¿De qué ciudad británica eran originarios The Beatles?',
    answers: ['Londres', 'Liverpool', 'Mánchester', 'Birmingham'],
    correctIndex: 1,
  },
  {
    id: 'mu-13',
    category: 'musica',
    text: '¿Qué significa el término musical "forte"?',
    answers: ['Tocar suave', 'Tocar fuerte', 'Tocar rápido', 'Tocar despacio'],
    correctIndex: 1,
  },
  {
    id: 'mu-14',
    category: 'musica',
    text: '¿Qué género musical nació en Nueva Orleans a principios del siglo XX?',
    answers: ['El blues', 'El jazz', 'El rock', 'El soul'],
    correctIndex: 1,
  },
  {
    id: 'mu-15',
    category: 'musica',
    text: '¿Cuántas teclas tiene un piano de cola estándar?',
    answers: ['76', '80', '88', '96'],
    correctIndex: 2,
  },
  {
    id: 'mu-16',
    category: 'musica',
    text: '¿Qué instrumento toca principalmente un violonchelista?',
    answers: ['El violín', 'El violonchelo', 'La viola', 'El contrabajo'],
    correctIndex: 1,
  },
  {
    id: 'mu-17',
    category: 'musica',
    text: '¿Cómo se llama el conjunto de músicos dirigido por un director con instrumentos de cuerda, viento y percusión?',
    answers: ['Coro', 'Orquesta', 'Cuarteto', 'Banda de garaje'],
    correctIndex: 1,
  },
  {
    id: 'mu-18',
    category: 'musica',
    text: '¿Qué unidad mide la velocidad de una pieza musical?',
    answers: ['Hercios', 'Pulsaciones por minuto', 'Decibelios', 'Octavas'],
    correctIndex: 1,
  },
  {
    id: 'mu-19',
    category: 'musica',
    text: '¿Qué compositor austríaco escribió "La flauta mágica"?',
    answers: ['Haydn', 'Mozart', 'Schubert', 'Strauss'],
    correctIndex: 1,
  },
  {
    id: 'mu-20',
    category: 'musica',
    text: '¿Qué instrumento de percusión consiste en dos platos metálicos que se golpean entre sí?',
    answers: ['El timbal', 'Los platillos', 'El bombo', 'La caja'],
    correctIndex: 1,
  },
  {
    id: 'mu-21',
    category: 'musica',
    text: '¿Qué nombre recibe la voz masculina más aguda en la ópera?',
    answers: ['Bajo', 'Tenor', 'Barítono', 'Contralto'],
    correctIndex: 1,
  },

  /* ------------------------------ Tecnología ----------------------------- */

  {
    id: 'te-08',
    category: 'tecnologia',
    text: '¿Qué sistema de numeración usa internamente un ordenador?',
    answers: ['El decimal', 'El binario', 'El romano', 'El hexadecimal puro'],
    correctIndex: 1,
  },
  {
    id: 'te-09',
    category: 'tecnologia',
    text: '¿Qué significan las siglas CPU?',
    answers: [
      'Central Processing Unit',
      'Computer Power Unit',
      'Central Program Utility',
      'Control Processing Usage',
    ],
    correctIndex: 0,
  },
  {
    id: 'te-10',
    category: 'tecnologia',
    text: '¿Qué lenguaje se usa para dar estilo a una página web?',
    answers: ['HTML', 'CSS', 'SQL', 'JSON'],
    correctIndex: 1,
  },
  {
    id: 'te-11',
    category: 'tecnologia',
    text: '¿Qué tipo de memoria pierde su contenido al apagar el ordenador?',
    answers: ['El disco duro', 'La memoria RAM', 'La memoria ROM', 'La tarjeta SD'],
    correctIndex: 1,
  },
  {
    id: 'te-12',
    category: 'tecnologia',
    text: '¿Qué protocolo traduce nombres de dominio en direcciones IP?',
    answers: ['DNS', 'FTP', 'SMTP', 'SSH'],
    correctIndex: 0,
  },
  {
    id: 'te-13',
    category: 'tecnologia',
    text: '¿Cómo se llama el software que traduce código fuente a código ejecutable?',
    answers: ['Editor', 'Compilador', 'Depurador', 'Intérprete de comandos'],
    correctIndex: 1,
  },
  {
    id: 'te-14',
    category: 'tecnologia',
    text: '¿Qué sistema operativo tiene un pingüino como mascota?',
    answers: ['Windows', 'Linux', 'macOS', 'Android'],
    correctIndex: 1,
  },
  {
    id: 'te-15',
    category: 'tecnologia',
    text: '¿Cuántos bytes tiene aproximadamente un kilobyte en informática?',
    answers: ['100', '512', '1.024', '2.048'],
    correctIndex: 2,
  },
  {
    id: 'te-16',
    category: 'tecnologia',
    text: '¿Qué tecnología permite conectar dispositivos sin cables a pocos metros de distancia?',
    answers: ['Bluetooth', 'Ethernet', 'Fibra óptica', 'USB'],
    correctIndex: 0,
  },
  {
    id: 'te-17',
    category: 'tecnologia',
    text: '¿Qué significa la sigla IA en informática?',
    answers: [
      'Interfaz Avanzada',
      'Inteligencia Artificial',
      'Interconexión Automática',
      'Índice de Acceso',
    ],
    correctIndex: 1,
  },
  {
    id: 'te-18',
    category: 'tecnologia',
    text: '¿Qué componente almacena los datos de forma permanente en un ordenador?',
    answers: ['La RAM', 'El disco duro o SSD', 'La caché', 'El procesador'],
    correctIndex: 1,
  },
  {
    id: 'te-19',
    category: 'tecnologia',
    text: '¿Qué lenguaje de programación se ejecuta de forma nativa en los navegadores web?',
    answers: ['Python', 'JavaScript', 'Java', 'C++'],
    correctIndex: 1,
  },
  {
    id: 'te-20',
    category: 'tecnologia',
    text: '¿Qué es un "firewall" en seguridad informática?',
    answers: [
      'Un antivirus de pago',
      'Un filtro que controla el tráfico de red',
      'Una copia de seguridad',
      'Un tipo de contraseña',
    ],
    correctIndex: 1,
  },
  {
    id: 'te-21',
    category: 'tecnologia',
    text: '¿Qué significa "open source"?',
    answers: [
      'Que el programa es gratuito',
      'Que el código fuente está disponible públicamente',
      'Que funciona sin conexión',
      'Que no tiene errores',
    ],
    correctIndex: 1,
  },
  {
    id: 'te-22',
    category: 'tecnologia',
    text: '¿Qué dispositivo dirige el tráfico entre una red local e internet?',
    answers: ['El router', 'El monitor', 'El escáner', 'La impresora'],
    correctIndex: 0,
  },
];

/**
 * Baraja las cuatro respuestas conservando cuál es la correcta.
 *
 * Sin esto, la posición de la respuesta correcta es fija para siempre y en la
 * tercera partida los jugadores memorizan el sitio del botón en vez de la
 * respuesta. Se aplica por partida, con el mismo generador determinista que
 * elige las preguntas.
 */
export function shuffleQuizAnswers(question: QuizQuestion, rng: () => number): QuizQuestion {
  const order = shuffleWithRng([0, 1, 2, 3], rng);
  const answers = order.map((index) => question.answers[index]!) as [
    string,
    string,
    string,
    string,
  ];
  return {
    ...question,
    answers,
    correctIndex: order.indexOf(question.correctIndex) as 0 | 1 | 2 | 3,
  };
}

/**
 * Cuántas preguntas hay por categoría.
 *
 * Es un literal a propósito, no un cálculo sobre `QUIZ_QUESTIONS`: el lobby
 * necesita estos números para avisar antes de empezar, y si los derivara del
 * banco arrastraría los enunciados de las 151 preguntas al bundle del cliente
 * (unos 27 kB que el navegador no necesita, porque las preguntas las envía el
 * servidor de una en una). `quiz.test.ts` comprueba que el mapa no se
 * desincroniza del banco real.
 */
export const QUIZ_CATEGORY_SIZES: Record<QuizCategory, number> = {
  'cultura general': 22,
  ciencia: 22,
  historia: 21,
  geografia: 22,
  cine: 21,
  musica: 21,
  tecnologia: 22,
};

/** Total de preguntas jugables con las categorías marcadas. Vacío = todas. */
export function quizPoolSize(categories: readonly QuizCategory[]): number {
  const values = Object.values(QUIZ_CATEGORY_SIZES);
  if (categories.length === 0) return values.reduce((sum, count) => sum + count, 0);
  return categories.reduce((sum, category) => sum + (QUIZ_CATEGORY_SIZES[category] ?? 0), 0);
}

/** Preguntas disponibles para una selección de categorías. Vacío = todas. */
export function quizPool(categories: readonly QuizCategory[]): QuizQuestion[] {
  if (categories.length === 0) return QUIZ_QUESTIONS.slice();
  return QUIZ_QUESTIONS.filter((question) => categories.includes(question.category));
}

/**
 * Cuántas preguntas se pueden jugar realmente con las categorías elegidas.
 *
 * El lobby lo usa para avisar antes de empezar, y el servidor para recortar la
 * partida en lugar de colar preguntas de categorías que nadie ha pedido.
 */
export function availableQuizQuestions(
  categories: readonly QuizCategory[],
  requested: number,
): number {
  const pool = quizPool(categories).length;
  return Math.max(1, Math.min(requested, pool));
}
