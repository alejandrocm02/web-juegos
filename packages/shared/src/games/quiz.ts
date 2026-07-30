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
];
