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

/** Pregunta tal y como se envia al cliente: nunca incluye la respuesta correcta. */
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
    text: 'Cuantos lados tiene un heptagono?',
    answers: ['Seis', 'Siete', 'Ocho', 'Nueve'],
    correctIndex: 1,
  },
  {
    id: 'cg-02',
    category: 'cultura general',
    text: 'Que instrumento mide la presion atmosferica?',
    answers: ['Higrometro', 'Barometro', 'Anemometro', 'Pluviometro'],
    correctIndex: 1,
  },
  {
    id: 'cg-03',
    category: 'cultura general',
    text: 'De que color es la caja negra de un avion?',
    answers: ['Negra', 'Gris', 'Naranja', 'Azul'],
    correctIndex: 2,
  },
  {
    id: 'cg-04',
    category: 'cultura general',
    text: 'Cuantas cuerdas tiene un violin?',
    answers: ['Cuatro', 'Cinco', 'Seis', 'Siete'],
    correctIndex: 0,
  },
  {
    id: 'cg-05',
    category: 'cultura general',
    text: 'Que idioma tiene mas hablantes nativos en el mundo?',
    answers: ['Ingles', 'Espanol', 'Hindi', 'Chino mandarin'],
    correctIndex: 3,
  },
  {
    id: 'cg-06',
    category: 'cultura general',
    text: 'Cual es el metal liquido a temperatura ambiente?',
    answers: ['Mercurio', 'Plomo', 'Estano', 'Zinc'],
    correctIndex: 0,
  },
  {
    id: 'ci-01',
    category: 'ciencia',
    text: 'Cual es el simbolo quimico del potasio?',
    answers: ['P', 'Po', 'K', 'Pt'],
    correctIndex: 2,
  },
  {
    id: 'ci-02',
    category: 'ciencia',
    text: 'Que planeta tiene el sistema de anillos mas visible?',
    answers: ['Jupiter', 'Saturno', 'Urano', 'Neptuno'],
    correctIndex: 1,
  },
  {
    id: 'ci-03',
    category: 'ciencia',
    text: 'Cual es el organo mas grande del cuerpo humano?',
    answers: ['El higado', 'El intestino', 'La piel', 'El pulmon'],
    correctIndex: 2,
  },
  {
    id: 'ci-04',
    category: 'ciencia',
    text: 'Que gas absorben las plantas para la fotosintesis?',
    answers: ['Oxigeno', 'Dioxido de carbono', 'Nitrogeno', 'Metano'],
    correctIndex: 1,
  },
  {
    id: 'ci-05',
    category: 'ciencia',
    text: 'A que velocidad aproximada viaja la luz en el vacio?',
    answers: ['300.000 km/s', '30.000 km/s', '3.000 km/s', '3.000.000 km/s'],
    correctIndex: 0,
  },
  {
    id: 'ci-06',
    category: 'ciencia',
    text: 'Cuantos huesos tiene aproximadamente un adulto humano?',
    answers: ['186', '206', '226', '246'],
    correctIndex: 1,
  },
  {
    id: 'ci-07',
    category: 'ciencia',
    text: 'Que particula subatomica tiene carga negativa?',
    answers: ['Proton', 'Neutron', 'Electron', 'Positron'],
    correctIndex: 2,
  },
  {
    id: 'hi-01',
    category: 'historia',
    text: 'En que ano cayo el Muro de Berlin?',
    answers: ['1987', '1989', '1991', '1993'],
    correctIndex: 1,
  },
  {
    id: 'hi-02',
    category: 'historia',
    text: 'Quien fue el primer emperador romano?',
    answers: ['Julio Cesar', 'Augusto', 'Neron', 'Trajano'],
    correctIndex: 1,
  },
  {
    id: 'hi-03',
    category: 'historia',
    text: 'En que ano llego el ser humano a la Luna por primera vez?',
    answers: ['1965', '1969', '1972', '1975'],
    correctIndex: 1,
  },
  {
    id: 'hi-04',
    category: 'historia',
    text: 'Que civilizacion construyo Machu Picchu?',
    answers: ['Azteca', 'Maya', 'Inca', 'Olmeca'],
    correctIndex: 2,
  },
  {
    id: 'hi-05',
    category: 'historia',
    text: 'En que siglo se invento la imprenta de tipos moviles en Europa?',
    answers: ['Siglo XIII', 'Siglo XV', 'Siglo XVII', 'Siglo XVIII'],
    correctIndex: 1,
  },
  {
    id: 'hi-06',
    category: 'historia',
    text: 'Como se llamaba el barco en el que Darwin dio la vuelta al mundo?',
    answers: ['Beagle', 'Endeavour', 'Victoria', 'Discovery'],
    correctIndex: 0,
  },
  {
    id: 'ge-01',
    category: 'geografia',
    text: 'Cual es el rio mas largo de Africa?',
    answers: ['Congo', 'Nilo', 'Niger', 'Zambeze'],
    correctIndex: 1,
  },
  {
    id: 'ge-02',
    category: 'geografia',
    text: 'Cual es la capital de Australia?',
    answers: ['Sidney', 'Melbourne', 'Canberra', 'Perth'],
    correctIndex: 2,
  },
  {
    id: 'ge-03',
    category: 'geografia',
    text: 'En que continente esta el desierto de Atacama?',
    answers: ['Africa', 'Asia', 'America del Sur', 'Oceania'],
    correctIndex: 2,
  },
  {
    id: 'ge-04',
    category: 'geografia',
    text: 'Cual es el pais mas extenso del mundo?',
    answers: ['Canada', 'China', 'Estados Unidos', 'Rusia'],
    correctIndex: 3,
  },
  {
    id: 'ge-05',
    category: 'geografia',
    text: 'Que mar separa Europa de Africa por el sur?',
    answers: ['Mar Negro', 'Mar Mediterraneo', 'Mar Caspio', 'Mar Rojo'],
    correctIndex: 1,
  },
  {
    id: 'ge-06',
    category: 'geografia',
    text: 'Cual es la montana mas alta de America?',
    answers: ['Aconcagua', 'Denali', 'Chimborazo', 'Huascaran'],
    correctIndex: 0,
  },
  {
    id: 'ge-07',
    category: 'geografia',
    text: 'Cuantas comunidades autonomas tiene Espana?',
    answers: ['15', '16', '17', '19'],
    correctIndex: 2,
  },
  {
    id: 'cn-01',
    category: 'cine',
    text: 'Quien dirigio la pelicula Jurassic Park de 1993?',
    answers: ['James Cameron', 'Steven Spielberg', 'Ridley Scott', 'George Lucas'],
    correctIndex: 1,
  },
  {
    id: 'cn-02',
    category: 'cine',
    text: 'En que pelicula aparece el personaje Forrest Gump?',
    answers: ['Big Fish', 'Forrest Gump', 'Rain Man', 'Cast Away'],
    correctIndex: 1,
  },
  {
    id: 'cn-03',
    category: 'cine',
    text: 'Que estudio produjo la pelicula Toy Story?',
    answers: ['Pixar', 'DreamWorks', 'Blue Sky', 'Illumination'],
    correctIndex: 0,
  },
  {
    id: 'cn-04',
    category: 'cine',
    text: 'Cual de estas peliculas es de ciencia ficcion?',
    answers: ['Blade Runner', 'Casablanca', 'Rocky', 'El Padrino'],
    correctIndex: 0,
  },
  {
    id: 'cn-05',
    category: 'cine',
    text: 'Quien interpreta a Neo en Matrix?',
    answers: ['Brad Pitt', 'Keanu Reeves', 'Tom Cruise', 'Will Smith'],
    correctIndex: 1,
  },
  {
    id: 'cn-06',
    category: 'cine',
    text: 'De que pais es originario el estudio de animacion Ghibli?',
    answers: ['Corea del Sur', 'China', 'Japon', 'Francia'],
    correctIndex: 2,
  },
  {
    id: 'mu-01',
    category: 'musica',
    text: 'Cuantas teclas tiene un piano estandar?',
    answers: ['76', '82', '88', '92'],
    correctIndex: 2,
  },
  {
    id: 'mu-02',
    category: 'musica',
    text: 'De que ciudad eran originarios los Beatles?',
    answers: ['Londres', 'Liverpool', 'Manchester', 'Dublin'],
    correctIndex: 1,
  },
  {
    id: 'mu-03',
    category: 'musica',
    text: 'Que compositor escribio Las cuatro estaciones?',
    answers: ['Bach', 'Mozart', 'Vivaldi', 'Beethoven'],
    correctIndex: 2,
  },
  {
    id: 'mu-04',
    category: 'musica',
    text: 'Cuantas cuerdas tiene una guitarra espanola clasica?',
    answers: ['Cuatro', 'Cinco', 'Seis', 'Doce'],
    correctIndex: 2,
  },
  {
    id: 'mu-05',
    category: 'musica',
    text: 'Que genero musical nacio en Jamaica?',
    answers: ['Reggae', 'Tango', 'Flamenco', 'Blues'],
    correctIndex: 0,
  },
  {
    id: 'mu-06',
    category: 'musica',
    text: 'Que instrumento toca principalmente un percusionista de bateria?',
    answers: ['Cuerdas', 'Viento madera', 'Percusion', 'Viento metal'],
    correctIndex: 2,
  },
  {
    id: 'te-01',
    category: 'tecnologia',
    text: 'Que significa HTML?',
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
    text: 'Cuantos bits tiene un byte?',
    answers: ['4', '8', '16', '32'],
    correctIndex: 1,
  },
  {
    id: 'te-03',
    category: 'tecnologia',
    text: 'Quien creo el lenguaje de programacion Python?',
    answers: ['Guido van Rossum', 'James Gosling', 'Bjarne Stroustrup', 'Dennis Ritchie'],
    correctIndex: 0,
  },
  {
    id: 'te-04',
    category: 'tecnologia',
    text: 'Que protocolo se usa para enviar correo electronico?',
    answers: ['FTP', 'SMTP', 'SSH', 'DNS'],
    correctIndex: 1,
  },
  {
    id: 'te-05',
    category: 'tecnologia',
    text: 'Que empresa desarrollo el sistema operativo Android?',
    answers: ['Apple', 'Microsoft', 'Google', 'Nokia'],
    correctIndex: 2,
  },
  {
    id: 'te-06',
    category: 'tecnologia',
    text: 'Que significa la sigla CPU?',
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
    text: 'En una direccion web, que indica el prefijo https?',
    answers: [
      'Que la conexion esta cifrada',
      'Que la pagina es gratuita',
      'Que la pagina es antigua',
      'Que la pagina usa cookies',
    ],
    correctIndex: 0,
  },
  {
    id: 'cg-07',
    category: 'cultura general',
    text: 'Cuantos minutos dura un partido de futbol reglamentario sin prorroga?',
    answers: ['80', '90', '100', '120'],
    correctIndex: 1,
  },
];
