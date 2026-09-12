# Optimisation des aperçus 3D

Le lecteur et les miniatures utilisent désormais le chargeur correspondant au fichier sélectionné : FBXLoader pour FBX, GLTFLoader pour GLB/GLTF. L'ancienne recherche préalable d'un fichier GLB voisin pouvait afficher une autre version du modèle ; elle est supprimée. Les caractères réservés dans les chemins locaux sont encodés.

Le lecteur conserve les matériaux originaux. L'ancien remplacement systématique de certains matériaux perdait des propriétés du modèle. Le cadrage est maintenant porté par un groupe parent, sans écraser les transformations du modèle.

La fermeture est définitive, même si le chargement se termine plus tard : aucune nouvelle boucle de rendu ne démarre, et le modèle reçu tardivement est libéré. Les géométries, matériaux, textures et squelettes sont libérés à la fermeture ; les ressources partagées sont dédupliquées. Les miniatures libèrent aussi leurs ressources et leur contexte WebGL après leur rendu unique. Les erreurs de chargement nettoient le lecteur.

Le rendu interactif est suspendu lorsque le document est masqué, repris sans double boucle lorsqu'il redevient visible, et arrêté si le canvas est détaché. La densité de rendu est plafonnée à 2 pour limiter le travail sur les écrans à forte densité ; ce choix peut légèrement réduire la finesse au-delà de 2.

Validation : 102 tests de l'application réussis, dont cinq nouveaux. Les tests du cycle de vie exécutent la véritable fonction du lecteur avec les objets de scène Three.js, un renderer et des contrôles simulés. Ils couvrent les fichiers sélectionnés, les ressources partagées, une fermeture pendant le chargement, le masquage de la fenêtre, les matériaux et transformations conservés et les erreurs. La syntaxe des scripts HTML est également vérifiée. Aucun chiffre de gain GPU ou mémoire n'a été mesuré, et le rendu WebGL réel dans Electron reste à contrôler visuellement.

La lecture des clips d'animation n'est pas ajoutée dans cette passe : le chargeur les transmet, mais le lecteur reste un aperçu du modèle.
