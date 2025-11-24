/**
 * Script de diagnostic des doublons dans le cache React Query
 *
 * UTILISATION :
 * 1. Ouvrir l'application dans le navigateur
 * 2. Ouvrir la console (F12)
 * 3. Copier-coller ce script entier et appuyer sur Entrée
 * 4. Le rapport s'affiche dans la console
 */

(function checkDuplicatesInCache() {
  console.log('🔍 Diagnostic des doublons dans le cache...\n');

  // Accéder au queryClient de React Query
  const queryClient = window.__REACT_QUERY_CLIENT__;

  if (!queryClient) {
    console.error('❌ QueryClient non trouvé. Assurez-vous d\'être sur la page de l\'application.');
    console.log('💡 Essayez de rafraîchir la page et de réessayer.');
    return;
  }

  const cache = queryClient.getQueryCache();
  const queries = cache.getAll();

  console.log(`📦 Cache React Query : ${queries.length} requêtes en cache\n`);

  let totalDuplicates = 0;
  let daysWithDuplicates = 0;
  let totalPoints = 0;

  // Analyser les requêtes de type consumptionDetail
  const consumptionQueries = queries.filter(q =>
    q.queryKey[0] === 'consumptionDetail' || q.queryKey[0] === 'productionDetail'
  );

  console.log(`🔎 Analyse de ${consumptionQueries.length} jours de données détaillées...\n`);

  consumptionQueries.forEach(query => {
    const data = query.state.data;
    if (!data?.data?.meter_reading?.interval_reading) return;

    const points = data.data.meter_reading.interval_reading;
    const date = query.queryKey[2]; // Date du jour
    const type = query.queryKey[0]; // consumptionDetail ou productionDetail

    // Compter les timestamps uniques
    const timestamps = points.map(p => p.date);
    const uniqueTimestamps = new Set(timestamps);

    const duplicateCount = timestamps.length - uniqueTimestamps.size;

    totalPoints += points.length;

    if (duplicateCount > 0) {
      daysWithDuplicates++;
      totalDuplicates += duplicateCount;
      console.log(`⚠️ ${type} - ${date} : ${duplicateCount} doublons (${points.length} points, ${uniqueTimestamps.size} uniques)`);
    }
  });

  // Rapport final
  console.log('\n' + '='.repeat(60));
  console.log('📊 RAPPORT DE DIAGNOSTIC');
  console.log('='.repeat(60));

  if (totalDuplicates === 0) {
    console.log('✅ AUCUN DOUBLON DÉTECTÉ !');
    console.log(`   Total : ${totalPoints} points analysés`);
    console.log('   Le cache est propre 🎉');
  } else {
    console.log(`❌ DOUBLONS DÉTECTÉS !`);
    console.log(`   Jours affectés : ${daysWithDuplicates}`);
    console.log(`   Total doublons : ${totalDuplicates} points`);
    console.log(`   Total points : ${totalPoints}`);
    console.log(`   Taux de doublons : ${((totalDuplicates / totalPoints) * 100).toFixed(2)}%`);
    console.log('\n💡 RECOMMANDATION :');
    console.log('   1. Vider le cache (bouton dans la sidebar)');
    console.log('   2. Récupérer les données à nouveau');
    console.log('   3. Relancer ce diagnostic');
  }

  console.log('='.repeat(60) + '\n');

  // Retourner les stats pour utilisation programmatique
  return {
    totalQueries: consumptionQueries.length,
    totalPoints,
    totalDuplicates,
    daysWithDuplicates,
    hasDuplicates: totalDuplicates > 0,
    duplicateRate: (totalDuplicates / totalPoints) * 100
  };
})();
